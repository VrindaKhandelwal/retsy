// Edge Function: confirm-purchase
//
// GET  ?id=<purchase_id>&token=<confirm_token>
//      -> returns the purchase so the confirmation page can render it.
//
// POST { id, token, return_deadline?, item_name?, retailer?, order_number? }
//      -> applies any edits, marks the purchase 'confirmed', and schedules
//         the 7/3/1-day reminder rows (skipping any that have already passed).
//
// The confirm_token (a random uuid stored on the purchase row) stands in
// for auth in V1 — anyone with the link in their confirmation email can
// view/confirm that one purchase, nothing else.

import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

function addDays(dateStr: string, days: number): Date {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

async function loadPurchase(supabase: any, id: string, token: string) {
  const { data, error } = await supabase
    .from("purchases")
    .select(
      "id, user_id, retailer, item_name, order_date, order_number, return_deadline, confidence, status, confirm_token"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data || data.confirm_token !== token) {
    return null;
  }
  return data;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const supabase = getSupabaseAdmin();

  if (req.method === "GET") {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const token = url.searchParams.get("token");
    if (!id || !token) {
      return jsonResponse({ error: "Missing id or token" }, 400);
    }

    const purchase = await loadPurchase(supabase, id, token);
    if (!purchase) {
      return jsonResponse({ error: "Not found" }, 404);
    }
    return jsonResponse({ purchase });
  }

  if (req.method === "POST") {
    let body: {
      id?: string;
      token?: string;
      return_deadline?: string;
      item_name?: string;
      retailer?: string;
      order_number?: string;
    };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { id, token } = body;
    if (!id || !token) {
      return jsonResponse({ error: "Missing id or token" }, 400);
    }

    const purchase = await loadPurchase(supabase, id, token);
    if (!purchase) {
      return jsonResponse({ error: "Not found" }, 404);
    }

    const updates: Record<string, unknown> = { status: "confirmed" };
    if (body.return_deadline) updates.return_deadline = body.return_deadline;
    if (body.item_name) updates.item_name = body.item_name;
    if (body.retailer) updates.retailer = body.retailer;
    if (body.order_number !== undefined) updates.order_number = body.order_number;

    const { data: updated, error: updateError } = await supabase
      .from("purchases")
      .update(updates)
      .eq("id", id)
      .select(
        "id, retailer, item_name, order_date, order_number, return_deadline, status"
      )
      .single();

    if (updateError) {
      console.error("purchase update error", updateError);
      return jsonResponse({ error: "Database error" }, 500);
    }

    // Schedule reminders: 7/3/1 days before the (possibly edited) deadline.
    // Skip any reminder whose send time has already passed so we don't
    // immediately fire a backlog of emails for a deadline that's already close.
    const deadline = updated.return_deadline as string;
    const reminderPlan: { type: "7_day" | "3_day" | "1_day"; offset: number }[] = [
      { type: "7_day", offset: -7 },
      { type: "3_day", offset: -3 },
      { type: "1_day", offset: -1 },
    ];

    const now = new Date();
    const rows = reminderPlan
      .map((r) => ({
        purchase_id: id,
        reminder_type: r.type,
        send_at: addDays(deadline, r.offset).toISOString(),
      }))
      .filter((r) => new Date(r.send_at) > now);

    if (rows.length > 0) {
      // Clear any previously scheduled (unsent) reminders for this purchase
      // first, in case the user is re-confirming after editing the deadline.
      await supabase
        .from("reminders")
        .delete()
        .eq("purchase_id", id)
        .is("sent_at", null);

      const { error: reminderError } = await supabase
        .from("reminders")
        .upsert(rows, { onConflict: "purchase_id,reminder_type" });

      if (reminderError) {
        console.error("reminder insert error", reminderError);
        // Not fatal — the purchase is still confirmed; reminders can be
        // backfilled. Surface a soft warning in the response.
        return jsonResponse({
          purchase: updated,
          warning: "Confirmed, but reminders failed to schedule.",
        });
      }
    }

    return jsonResponse({ purchase: updated });
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
});
