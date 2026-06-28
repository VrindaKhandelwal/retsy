// Edge Function: update-status
//
// POST { email, token, purchase_id, action: "returned" | "kept" | "delete" }
//   -> validates the user's dashboard_token, then updates the purchase's
//      status (or deletes it) and cancels any unsent reminders, since a
//      returned/kept/deleted purchase no longer needs to be chased.

import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

type Action = "returned" | "kept" | "delete";

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
  if (!["returned", "kept", "delete"].includes(action)) {
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
    .select("id, user_id")
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

  const newStatus = action === "returned" ? "returned" : "kept";

  const { error: updateError } = await supabase
    .from("purchases")
    .update({ status: newStatus })
    .eq("id", purchase_id);

  if (updateError) {
    console.error("status update error", updateError);
    return jsonResponse({ error: "Database error" }, 500);
  }

  // No need to remind someone about a return they've already resolved.
  await supabase
    .from("reminders")
    .delete()
    .eq("purchase_id", purchase_id)
    .is("sent_at", null);

  return jsonResponse({ ok: true });
});
