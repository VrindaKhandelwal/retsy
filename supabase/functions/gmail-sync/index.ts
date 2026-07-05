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
const MAX_MESSAGES_PER_RUN = 25;
const MAX_MESSAGES_FIRST_SYNC = 50;
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

Deno.serve(async (req) => {
  if (CRON_SECRET) {
    const url = new URL(req.url);
    const provided =
      req.headers.get("x-cron-secret") || url.searchParams.get("secret");
    if (provided !== CRON_SECRET) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
  }

  const supabase = getSupabaseAdmin();

  const { data: accounts, error: accountsError } = await supabase
    .from("gmail_accounts")
    .select("id, user_id, google_email, refresh_token, last_synced_at, users!inner(email)")
    .eq("status", "active")
    .limit(MAX_ACCOUNTS_PER_RUN);

  if (accountsError) {
    console.error("gmail accounts lookup error", accountsError);
    return jsonResponse({ error: "Database error" }, 500);
  }

  let scanned = 0;
  let added = 0;
  let skipped = 0;

  for (const account of accounts ?? []) {
    const runStart = new Date();
    const userEmail = (account as any).users?.email;

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
      const isFirstSync = !account.last_synced_at;
      const since = account.last_synced_at
        ? new Date(new Date(account.last_synced_at).getTime() - WATERMARK_OVERLAP_MS)
        : new Date(Date.now() - 30 * 86_400_000);
      const afterEpoch = Math.floor(since.getTime() / 1000);

      // category:purchases is Gmail's own receipt classifier — personal
      // accounts only; Workspace inboxes would need a keyword query
      // (documented follow-up, not built in V2).
      const q = `category:purchases after:${afterEpoch}`;
      const messageIds = await listMessageIds(
        accessToken,
        q,
        isFirstSync ? MAX_MESSAGES_FIRST_SYNC : MAX_MESSAGES_PER_RUN
      );
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

      const newPurchases: {
        retailer: string;
        itemName: string;
        orderTotal: string | null;
        returnDeadline: string;
      }[] = [];

      for (const messageId of newIds) {
        try {
          const message = await getMessage(accessToken, messageId);
          const extracted = await extractPurchaseFromEmail(
            message.text,
            message.from
          );

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
          dashboardUrl: `${APP_URL}/dashboard`,
        }).catch((e) => console.error("digest email failed", e));
      }

      // Advance the watermark to run start (not "now") so messages arriving
      // mid-run land inside the next overlap window.
      await supabase
        .from("gmail_accounts")
        .update({
          last_synced_at: runStart.toISOString(),
          last_sync_error: null,
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

  return jsonResponse({
    ok: true,
    accounts: accounts?.length ?? 0,
    scanned,
    added,
    skipped,
  });
});
