// Edge Function: send-reminders
//
// Intended to be invoked on a schedule (Supabase scheduled function / pg_cron
// hitting this URL, e.g. every 15-60 minutes — see README for the cron
// setup). Finds all reminders that are due and unsent, sends the reminder
// email, and marks them sent. Idempotent: re-running with nothing due is a
// no-op, and reminders are only ever marked sent after the email send
// succeeds, so a crash mid-run just retries the same rows next time.

import { jsonResponse } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { sendReminderEmail } from "../_shared/resend.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "https://app.retsy.xyz";
const CRON_SECRET = Deno.env.get("CRON_SECRET");

const DAYS_LEFT_BY_TYPE: Record<string, number> = {
  "7_day": 7,
  "3_day": 3,
  "1_day": 1,
};

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
  const nowIso = new Date().toISOString();

  // Only send reminders for purchases still pending the user's action
  // (confirmed and not yet returned/kept) — a 'kept'/'returned' purchase
  // has its unsent reminders deleted by update-status, but this is a
  // belt-and-suspenders check in case that ever drifts.
  const { data: dueReminders, error } = await supabase
    .from("reminders")
    .select(
      `
      id,
      reminder_type,
      send_at,
      purchase_id,
      purchases!inner (
        id,
        retailer,
        item_name,
        return_deadline,
        status,
        user_id,
        users!inner ( email, dashboard_token )
      )
    `
    )
    .is("sent_at", null)
    .lte("send_at", nowIso)
    .in("purchases.status", ["confirmed", "to_return"])
    .limit(200);

  if (error) {
    console.error("due reminders lookup error", error);
    return jsonResponse({ error: "Database error" }, 500);
  }

  let sent = 0;
  let failed = 0;

  for (const reminder of dueReminders ?? []) {
    const purchase = (reminder as any).purchases;
    const userEmail = purchase?.users?.email;
    if (!purchase || !userEmail) {
      failed++;
      continue;
    }

    // Tokenized link — the dashboard has no login, so a bare /dashboard
    // would strand the user on the "find your dashboard" screen.
    const dashboardUrl = `${APP_URL}/dashboard?email=${encodeURIComponent(userEmail)}&token=${encodeURIComponent(purchase.users.dashboard_token)}`;

    try {
      await sendReminderEmail({
        to: userEmail,
        retailer: purchase.retailer,
        itemName: purchase.item_name,
        returnDeadline: purchase.return_deadline,
        daysLeft: DAYS_LEFT_BY_TYPE[reminder.reminder_type] ?? 1,
        dashboardUrl,
      });

      await supabase
        .from("reminders")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", reminder.id);

      sent++;
    } catch (err) {
      console.error(`failed to send reminder ${reminder.id}`, err);
      failed++;
    }
  }

  return jsonResponse({ ok: true, sent, failed, checked: dueReminders?.length ?? 0 });
});
