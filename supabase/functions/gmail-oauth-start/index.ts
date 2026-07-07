// Edge Function: gmail-oauth-start
//
// GET ?email=<email>&token=<dashboard_token>
//   -> validates the dashboard token, creates a one-time OAuth state row,
//      and 302-redirects to Google's consent screen.
//
// The browser navigates here directly (window.location), so the response
// is a redirect, not JSON. The state row keeps the dashboard token out of
// Google's redirect URLs.

import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { buildAuthUrl } from "../_shared/gmail.ts";

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

  const { data: stateRow, error: stateError } = await supabase
    .from("gmail_oauth_states")
    .insert({ user_id: user.id })
    .select("state")
    .single();

  if (stateError) {
    console.error("oauth state insert error", stateError);
    return jsonResponse({ error: "Database error" }, 500);
  }

  return new Response(null, {
    status: 302,
    headers: { Location: buildAuthUrl(stateRow.state) },
  });
});
