// Edge Function: list-purchases
//
// GET ?email=<email>&token=<dashboard_token>
//   -> returns all purchases for that user, newest deadline first, for the
//      dashboard page. The dashboard_token (mailed to the user) stands in
//      for a login session in V1.

import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const token = url.searchParams.get("token");

  if (!email || !token) {
    return jsonResponse({ error: "Missing email or token" }, 400);
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

  const { data: purchases, error: purchasesError } = await supabase
    .from("purchases")
    .select(
      "id, retailer, item_name, order_date, order_number, order_total, return_deadline, confidence, status, created_at"
    )
    .eq("user_id", user.id)
    .order("return_deadline", { ascending: true });

  if (purchasesError) {
    console.error("purchases lookup error", purchasesError);
    return jsonResponse({ error: "Database error" }, 500);
  }

  return jsonResponse({ purchases });
});
