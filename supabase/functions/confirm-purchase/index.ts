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
import { scheduleReminders } from "../_shared/reminders.ts";

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

    // Schedule reminders against the (possibly edited) deadline. A failure
    // is not fatal — the purchase is still confirmed; reminders can be
    // backfilled. Surface a soft warning in the response.
    const reminderError = await scheduleReminders(
      supabase,
      id,
      updated.return_deadline as string
    );

    if (reminderError) {
      return jsonResponse({
        purchase: updated,
        warning: "Confirmed, but reminders failed to schedule.",
      });
    }

    return jsonResponse({ purchase: updated });
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
});
