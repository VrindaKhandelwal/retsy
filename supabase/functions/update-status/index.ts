// Edge Function: update-status
//
// POST { email, token, purchase_id, action }
//   action: "returned" | "kept" | "delete"      -> resolved; unsent
//           reminders are cancelled since there's nothing left to chase.
//           "to_return" | "undecided"           -> still open; reminders
//           stay live (to_return is exactly the state where the deadline
//           matters most). "undecided" moves a purchase back to confirmed.
//           "edit" + { edits }                  -> fix extracted fields
//           (item_name, retailer, order_total, return_deadline); a deadline
//           change reschedules the reminders.

import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { scheduleReminders } from "../_shared/reminders.ts";

type Action = "returned" | "kept" | "delete" | "to_return" | "undecided" | "edit";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const STATUS_BY_ACTION: Record<Exclude<Action, "delete">, string> = {
  returned: "returned",
  kept: "kept",
  to_return: "to_return",
  undecided: "confirmed",
};

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: {
    email?: string;
    token?: string;
    purchase_id?: string;
    action?: Action;
    edits?: {
      item_name?: string;
      retailer?: string;
      order_total?: string;
      return_deadline?: string;
    };
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const email = (body.email || "").trim().toLowerCase();
  const { token, purchase_id, action } = body;

  if (!email || !token || !purchase_id || !action) {
    return jsonResponse({ error: "Missing required fields" }, 400);
  }
  if (!["returned", "kept", "delete", "to_return", "undecided", "edit"].includes(action)) {
    return jsonResponse({ error: "Invalid action" }, 400);
  }

  const supabase = getSupabaseAdmin();

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, dashboard_token")
    .eq("email", email)
    .maybeSingle();

  if (userError || !user || user.dashboard_token !== token) {
    return jsonResponse({ error: "Invalid link" }, 401);
  }

  // Confirm the purchase belongs to this user before touching it.
  const { data: purchase, error: purchaseError } = await supabase
    .from("purchases")
    .select("id, user_id, status, return_deadline, refund_status")
    .eq("id", purchase_id)
    .maybeSingle();

  if (purchaseError || !purchase || purchase.user_id !== user.id) {
    return jsonResponse({ error: "Purchase not found" }, 404);
  }

  if (action === "delete") {
    const { error } = await supabase.from("purchases").delete().eq("id", purchase_id);
    if (error) {
      console.error("delete error", error);
      return jsonResponse({ error: "Database error" }, 500);
    }
    return jsonResponse({ ok: true });
  }

  if (action === "edit") {
    const edits = body.edits ?? {};
    const updates: Record<string, unknown> = {};
    if (edits.item_name?.trim()) updates.item_name = edits.item_name.trim();
    if (edits.retailer?.trim()) updates.retailer = edits.retailer.trim();
    if (edits.order_total !== undefined) updates.order_total = edits.order_total.trim() || null;
    if (edits.return_deadline) {
      if (!ISO_DATE.test(edits.return_deadline)) {
        return jsonResponse({ error: "return_deadline must be YYYY-MM-DD" }, 400);
      }
      updates.return_deadline = edits.return_deadline;
    }
    if (Object.keys(updates).length === 0) {
      return jsonResponse({ error: "Nothing to edit" }, 400);
    }

    const { error } = await supabase.from("purchases").update(updates).eq("id", purchase_id);
    if (error) {
      console.error("edit error", error);
      return jsonResponse({ error: "Database error" }, 500);
    }

    // A corrected deadline means the reminder schedule is wrong — rebuild
    // it, but only for purchases that still need chasing.
    if (
      updates.return_deadline &&
      ["pending", "confirmed", "to_return"].includes(purchase.status)
    ) {
      await scheduleReminders(supabase, purchase_id, updates.return_deadline as string);
    }
    return jsonResponse({ ok: true });
  }

  const newStatus = STATUS_BY_ACTION[action];

  // Refund tracking: marking returned starts the refund clock ("pending"
  // until a refund email arrives). Un-marking clears a pending refund;
  // a received refund is a fact and survives status changes.
  const updates: Record<string, unknown> = { status: newStatus };
  if (purchase.refund_status !== "received") {
    updates.refund_status = action === "returned" ? "pending" : null;
  }

  const { error: updateError } = await supabase
    .from("purchases")
    .update(updates)
    .eq("id", purchase_id);

  if (updateError) {
    console.error("status update error", updateError);
    return jsonResponse({ error: "Database error" }, 500);
  }

  // No need to remind someone about a return they've already resolved.
  // Open states (to_return / undecided) keep their reminders live — and
  // when a purchase moves back from returned/kept, its reminders (deleted
  // on resolve) are rescheduled.
  if (action === "returned" || action === "kept") {
    await supabase
      .from("reminders")
      .delete()
      .eq("purchase_id", purchase_id)
      .is("sent_at", null);
  } else if (purchase.status === "returned" || purchase.status === "kept") {
    await scheduleReminders(supabase, purchase_id, purchase.return_deadline);
  }

  return jsonResponse({ ok: true });
});
