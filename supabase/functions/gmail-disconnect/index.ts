// Edge Function: gmail-disconnect
//
// POST { email, token }
//   -> validates the dashboard token, best-effort revokes the refresh token
//      at Google, and deletes the gmail_accounts row. Forwarding keeps
//      working; the user can reconnect any time.

import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { revokeToken } from "../_shared/gmail.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: { email?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const email = (body.email || "").trim().toLowerCase();
  const token = body.token;
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

  const { data: account } = await supabase
    .from("gmail_accounts")
    .select("id, refresh_token")
    .eq("user_id", user.id)
    .maybeSingle();

  if (account) {
    await revokeToken(account.refresh_token);
    const { error: deleteError } = await supabase
      .from("gmail_accounts")
      .delete()
      .eq("id", account.id);

    if (deleteError) {
      console.error("gmail account delete error", deleteError);
      return jsonResponse({ error: "Database error" }, 500);
    }
  }

  return jsonResponse({ ok: true });
});
