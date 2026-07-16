// Edge Function: gmail-sync
//
// Invoked on a daily schedule (pg_cron + pg_net, see
// migrations/0006_schedule_gmail_sync.sql), same auth pattern as
// send-reminders (x-cron-secret header). For each connected Gmail account:
// list recent purchase-category messages since the last watermark, extract
// purchases with OpenAI, insert them as confirmed with reminders scheduled,
// and send one digest email per account that gained purchases.
//
// Idempotent: the unique (user_id, gmail_message_id) index plus the 1-hour
// watermark overlap means re-running never duplicates a purchase.

import { jsonResponse } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { extractPurchaseFromEmail } from "../_shared/openaiExtract.ts";
import { getReturnWindowDays } from "../_shared/retailerPolicies.ts";
import { scheduleReminders } from "../_shared/reminders.ts";
import { sendGmailDigestEmail } from "../_shared/resend.ts";
import {
  GmailAuthRevokedError,
  getMessage,
  listMessageIds,
  refreshAccessToken,
} from "../_shared/gmail.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "https://app.retsy.xyz";
const CRON_SECRET = Deno.env.get("CRON_SECRET");

const MAX_ACCOUNTS_PER_RUN = 20;
// Listing ids is cheap (one API unit per page); extraction is the expensive
// part, so we list the whole window but process a bounded batch per run —
// edge functions have a wall-clock limit. The watermark only advances once
// the window is fully processed, so successive runs (or the daily cron)
// chew through any backlog.
const MAX_LIST_IDS = 500;
const MAX_EXTRACTIONS_PER_RUN = 50;
const MIN_CONFIDENCE = 0.5;
// Re-scan a little behind the watermark so messages that arrived while the
// previous run was in flight aren't missed; dedupe absorbs the overlap.
const WATERMARK_OVERLAP_MS = 60 * 60 * 1000;

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// A large backlog (e.g. first connect on a busy inbox) takes several runs
// at MAX_EXTRACTIONS_PER_RUN each. Rather than waiting a day per batch on
// the cron, a partial run re-triggers itself, up to this many chained runs.
const MAX_CHAIN = 10;

Deno.serve(async (req) => {
  if (CRON_SECRET) {
    const url = new URL(req.url);
    const provided =
      req.headers.get("x-cron-secret") || url.searchParams.get("secret");
    if (provided !== CRON_SECRET) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
  }

  let chain = 0;
  try {
    const body = await req.json();
    chain = Number(body?.chain) || 0;
  } catch {
    // empty body is fine
  }

  const supabase = getSupabaseAdmin();

  const { data: accounts, error: accountsError } = await supabase
    .from("gmail_accounts")
    .select("id, user_id, google_email, refresh_token, last_synced_at, users!inner(email, dashboard_token)")
    .eq("status", "active")
    .limit(MAX_ACCOUNTS_PER_RUN);

  if (accountsError) {
    console.error("gmail accounts lookup error", accountsError);
    return jsonResponse({ error: "Database error" }, 500);
  }

  let scanned = 0;
  let added = 0;
  let delivered = 0;
  let refunded = 0;
  let skipped = 0;
  let hasBacklog = false;

  for (const account of accounts ?? []) {
    const runStart = new Date();
    const userEmail = (account as any).users?.email;
    const dashboardToken = (account as any).users?.dashboard_token;

    let accessToken: string;
    try {
      accessToken = await refreshAccessToken(account.refresh_token);
    } catch (err) {
      if (err instanceof GmailAuthRevokedError) {
        // User revoked access, or the token hit the 7-day Testing-mode
        // expiry. Flag the account; the dashboard shows a Reconnect button.
        await supabase
          .from("gmail_accounts")
          .update({
            status: "revoked",
            last_sync_error: err.message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", account.id);
      } else {
        console.error(`token refresh failed for account ${account.id}`, err);
        await supabase
          .from("gmail_accounts")
          .update({
            last_sync_error: String(err),
            updated_at: new Date().toISOString(),
          })
          .eq("id", account.id);
      }
      continue;
    }

    try {
      const since = account.last_synced_at
        ? new Date(new Date(account.last_synced_at).getTime() - WATERMARK_OVERLAP_MS)
        : new Date(Date.now() - 30 * 86_400_000);
      const afterEpoch = Math.floor(since.getTime() / 1000);

      // category:purchases is Gmail's own receipt classifier — personal
      // accounts only; Workspace inboxes would need a keyword query
      // (documented follow-up, not built in V2).
      const q = `category:purchases after:${afterEpoch}`;
      // Gmail returns newest-first; process oldest-first so an order
      // confirmation is inserted before its own delivery notification
      // when both arrive in the same batch.
      const messageIds = (
        await listMessageIds(accessToken, q, MAX_LIST_IDS)
      ).reverse();
      scanned += messageIds.length;

      // Filter out already-imported messages in one query.
      let newIds = messageIds;
      if (messageIds.length > 0) {
        const { data: seen } = await supabase
          .from("purchases")
          .select("gmail_message_id")
          .eq("user_id", account.user_id)
          .in("gmail_message_id", messageIds);
        const seenSet = new Set((seen ?? []).map((r) => r.gmail_message_id));
        newIds = messageIds.filter((id) => !seenSet.has(id));
      }

      // Bound the expensive part; if there's more than one batch left, the
      // watermark stays put so the next run continues where this one ends.
      const windowComplete = newIds.length <= MAX_EXTRACTIONS_PER_RUN;
      if (!windowComplete) hasBacklog = true;
      newIds = newIds.slice(0, MAX_EXTRACTIONS_PER_RUN);

      const newPurchases: {
        retailer: string;
        itemName: string;
        orderTotal: string | null;
        returnDeadline: string;
      }[] = [];
      let newestProcessedMs = 0;

      for (const messageId of newIds) {
        try {
          const message = await getMessage(accessToken, messageId);
          newestProcessedMs = Math.max(newestProcessedMs, message.internalDateMs);
          const extracted = await extractPurchaseFromEmail(
            message.text,
            message.from
          );

          // Delivery notifications don't create purchases — they update the
          // matching purchase's deadline to count from delivery, which is
          // how most retailers actually measure the return window.
          if (extracted.email_type === "delivery_notification") {
            const didUpdate = await applyDeliveryDate(
              supabase,
              account.user_id,
              extracted,
              message.dateHeader
            );
            if (didUpdate) {
              delivered++;
            } else {
              skipped++;
            }
            continue;
          }

          // Return labels quote order details like receipts do, but they're
          // not purchases — and a generated label doesn't prove the return
          // shipped, so they never touch status. Refund notifications DO
          // prove it: mark the refund received (and the purchase returned).
          if (extracted.email_type === "return_notification") {
            skipped++;
            continue;
          }

          if (extracted.email_type === "refund_notification") {
            const didUpdate = await applyRefund(supabase, account.user_id, extracted);
            if (didUpdate) {
              refunded++;
            } else {
              skipped++;
            }
            continue;
          }

          if (!extracted.is_returnable_purchase || extracted.confidence < MIN_CONFIDENCE) {
            skipped++;
            continue;
          }

          // Cross-source dedupe: skip if this order was already tracked via
          // forwarding (or a previous Gmail message for the same order).
          if (extracted.order_number) {
            const { data: existing } = await supabase
              .from("purchases")
              .select("id")
              .eq("user_id", account.user_id)
              .eq("order_number", extracted.order_number)
              .limit(1);
            if (existing && existing.length > 0) {
              skipped++;
              continue;
            }
          }

          const orderDate =
            extracted.order_date ||
            (message.dateHeader ? toIsoDate(new Date(message.dateHeader)) : null) ||
            toIsoDate(new Date());
          const { windowDays } = await getReturnWindowDays(supabase, extracted.retailer);
          const returnDeadline = addDays(orderDate, windowDays);

          const { data: purchase, error: insertError } = await supabase
            .from("purchases")
            .insert({
              user_id: account.user_id,
              retailer: extracted.retailer,
              item_name: extracted.item_name,
              order_date: orderDate,
              order_number: extracted.order_number,
              order_total: extracted.order_total,
              return_deadline: returnDeadline,
              confidence: extracted.confidence,
              status: "confirmed",
              source: "gmail",
              gmail_message_id: messageId,
              raw_email_text: message.text.slice(0, 20000),
            })
            .select("id")
            .single();

          if (insertError) {
            // Unique violation = another run already imported it; anything
            // else is logged and skipped rather than failing the whole run.
            if (insertError.code !== "23505") {
              console.error(`purchase insert failed for message ${messageId}`, insertError);
            }
            skipped++;
            continue;
          }

          await scheduleReminders(supabase, purchase.id, returnDeadline);

          added++;
          newPurchases.push({
            retailer: extracted.retailer,
            itemName: extracted.item_name,
            orderTotal: extracted.order_total,
            returnDeadline,
          });
        } catch (err) {
          console.error(`failed to process message ${messageId}`, err);
          skipped++;
        }
      }

      if (newPurchases.length > 0 && userEmail) {
        await sendGmailDigestEmail({
          to: userEmail,
          purchases: newPurchases,
          dashboardUrl: `${APP_URL}/dashboard?email=${encodeURIComponent(userEmail)}&token=${encodeURIComponent(dashboardToken)}`,
        }).catch((e) => console.error("digest email failed", e));
      }

      // Watermark: when the window is fully processed, advance to run start
      // (not "now") so messages arriving mid-run land inside the next
      // overlap window. On a partial (backlog) run, advance only to the
      // newest message actually processed — we work oldest-first, so the
      // next run picks up exactly where this one stopped.
      const newWatermark = windowComplete
        ? runStart
        : newestProcessedMs > 0
          ? new Date(newestProcessedMs)
          : runStart;
      await supabase
        .from("gmail_accounts")
        .update({
          last_synced_at: newWatermark.toISOString(),
          last_sync_error: null,
          sync_backlog: !windowComplete,
          updated_at: new Date().toISOString(),
        })
        .eq("id", account.id);
    } catch (err) {
      console.error(`sync failed for account ${account.id}`, err);
      await supabase
        .from("gmail_accounts")
        .update({
          last_sync_error: String(err),
          updated_at: new Date().toISOString(),
        })
        .eq("id", account.id);
    }
  }

  // Chain another run if any account still has unprocessed backlog.
  if (hasBacklog && chain < MAX_CHAIN) {
    const next = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/gmail-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": CRON_SECRET ?? "",
      },
      body: JSON.stringify({ chain: chain + 1 }),
    }).catch((e) => console.error("sync chain trigger failed", e));

    // deno-lint-ignore no-explicit-any
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime?.waitUntil) {
      runtime.waitUntil(next);
    }
  }

  return jsonResponse({
    ok: true,
    accounts: accounts?.length ?? 0,
    scanned,
    added,
    delivered,
    refunded,
    skipped,
    backlog: hasBacklog,
    chain,
  });
});

// Match a refund notification to the purchase it refunds and record it.
// A refund is proof the return happened, so a still-open purchase is also
// marked returned (with its unsent reminders cancelled). Returns true if
// a purchase was updated.
async function applyRefund(
  supabase: any,
  userId: string,
  extracted: { retailer: string; order_number: string | null; refund_amount: string | null }
): Promise<boolean> {
  const OPEN = ["pending", "confirmed", "to_return"];
  let purchase: { id: string; status: string; refund_status: string | null } | null = null;

  if (extracted.order_number) {
    const { data } = await supabase
      .from("purchases")
      .select("id, status, refund_status")
      .eq("user_id", userId)
      .eq("order_number", extracted.order_number)
      .in("status", [...OPEN, "returned"])
      .limit(1);
    purchase = data?.[0] ?? null;
  }

  if (!purchase && extracted.retailer && extracted.retailer !== "Unknown") {
    // Most plausible candidate: newest purchase from the same retailer that
    // hasn't seen a refund yet — preferring ones already marked returned.
    const { data } = await supabase
      .from("purchases")
      .select("id, status, refund_status")
      .eq("user_id", userId)
      .ilike("retailer", extracted.retailer)
      .is("refund_status", null)
      .in("status", [...OPEN, "returned"])
      .order("status", { ascending: false }) // 'to_return'/'returned' sort after 'confirmed'
      .order("order_date", { ascending: false })
      .limit(1);
    purchase = data?.[0] ?? null;
  }

  if (!purchase || purchase.refund_status === "received") {
    return false;
  }

  const { error } = await supabase
    .from("purchases")
    .update({
      refund_status: "received",
      refund_amount: extracted.refund_amount,
      status: "returned",
    })
    .eq("id", purchase.id);

  if (error) {
    console.error(`refund update failed for purchase ${purchase.id}`, error);
    return false;
  }

  await supabase
    .from("reminders")
    .delete()
    .eq("purchase_id", purchase.id)
    .is("sent_at", null);

  return true;
}

// Match a delivery notification to an existing purchase and recompute its
// return deadline from the delivery date. Match by order number first;
// fall back to the user's most recent undelivered purchase from the same
// retailer. Returns true if a purchase was updated.
async function applyDeliveryDate(
  supabase: any,
  userId: string,
  extracted: {
    retailer: string;
    order_number: string | null;
    delivery_date: string | null;
  },
  messageDateHeader: string | null
): Promise<boolean> {
  let purchase: {
    id: string;
    retailer: string;
    status: string;
    order_date: string | null;
  } | null = null;

  if (extracted.order_number) {
    const { data } = await supabase
      .from("purchases")
      .select("id, retailer, status, order_date")
      .eq("user_id", userId)
      .eq("order_number", extracted.order_number)
      .in("status", ["pending", "confirmed"])
      .limit(1);
    purchase = data?.[0] ?? null;
  }

  if (!purchase && extracted.retailer && extracted.retailer !== "Unknown") {
    const { data } = await supabase
      .from("purchases")
      .select("id, retailer, status, order_date")
      .eq("user_id", userId)
      .ilike("retailer", extracted.retailer)
      .is("delivery_date", null)
      .in("status", ["pending", "confirmed"])
      .order("order_date", { ascending: false })
      .limit(1);
    purchase = data?.[0] ?? null;
  }

  if (!purchase) {
    return false;
  }

  // Sanity-check the extracted delivery date: it can't be before the order
  // was placed or meaningfully in the future. Extraction sometimes grabs an
  // unrelated date from the email; the message's own Date header is the
  // reliable fallback (delivery emails arrive on the delivery day).
  const messageDate = messageDateHeader
    ? toIsoDate(new Date(messageDateHeader))
    : toIsoDate(new Date());
  let deliveryDate = extracted.delivery_date || messageDate;
  const tooEarly = purchase.order_date && deliveryDate < purchase.order_date;
  const tooLate = deliveryDate > addDays(toIsoDate(new Date()), 2);
  if (tooEarly || tooLate) {
    deliveryDate = messageDate;
  }
  if (purchase.order_date && deliveryDate < purchase.order_date) {
    // Even the email's own date predates the order — we matched the wrong
    // purchase (retailer fallback). Leave it alone.
    return false;
  }

  const { windowDays } = await getReturnWindowDays(supabase, purchase.retailer);
  const newDeadline = addDays(deliveryDate, windowDays);

  const { error } = await supabase
    .from("purchases")
    .update({
      delivery_date: deliveryDate,
      return_deadline: newDeadline,
      deadline_basis: "delivery_date",
    })
    .eq("id", purchase.id);

  if (error) {
    console.error(`delivery update failed for purchase ${purchase.id}`, error);
    return false;
  }

  // Pending (V1-forwarded, unconfirmed) purchases get reminders scheduled
  // at confirm time from the updated deadline; only reschedule live ones.
  if (purchase.status === "confirmed") {
    await scheduleReminders(supabase, purchase.id, newDeadline);
  }
  return true;
}
