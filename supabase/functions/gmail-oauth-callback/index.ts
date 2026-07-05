// Edge Function: gmail-oauth-callback
//
// Google redirects here after the consent screen:
//   GET ?code=<auth_code>&state=<state>          (user approved)
//   GET ?error=access_denied&state=<state>       (user declined)
//
// Consumes the one-time state row, exchanges the code for tokens, upserts
// the gmail_accounts row, and always 302-redirects back to the dashboard
// (?gmail=connected or ?gmail=error) — never a dead-end page.

import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { exchangeCode, parseIdTokenEmail } from "../_shared/gmail.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "https://app.retsy.xyz";
const STATE_MAX_AGE_MS = 15 * 60 * 1000;
// How far back the first sync looks for receipts.
const INITIAL_LOOKBACK_DAYS = 30;

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}

function dashboardUrl(email: string, token: string, gmailFlag: string): string {
  return `${APP_URL}/dashboard?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}&gmail=${gmailFlag}`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (!state) {
    return redirect(`${APP_URL}/dashboard?gmail=error`);
  }

  const supabase = getSupabaseAdmin();

  // Load-and-delete the one-time state row.
  const { data: stateRow } = await supabase
    .from("gmail_oauth_states")
    .select("state, user_id, created_at")
    .eq("state", state)
    .maybeSingle();

  if (stateRow) {
    await supabase.from("gmail_oauth_states").delete().eq("state", state);
  }

  if (
    !stateRow ||
    Date.now() - new Date(stateRow.created_at).getTime() > STATE_MAX_AGE_MS
  ) {
    return redirect(`${APP_URL}/dashboard?gmail=error`);
  }

  // We need the user's email + dashboard token to send them back to a
  // working dashboard URL, whatever happens next.
  const { data: user } = await supabase
    .from("users")
    .select("id, email, dashboard_token")
    .eq("id", stateRow.user_id)
    .maybeSingle();

  if (!user) {
    return redirect(`${APP_URL}/dashboard?gmail=error`);
  }

  if (oauthError || !code) {
    // User declined the consent screen.
    return redirect(dashboardUrl(user.email, user.dashboard_token, "error"));
  }

  try {
    const tokens = await exchangeCode(code);
    const googleEmail = parseIdTokenEmail(tokens.id_token);

    const initialWatermark = new Date(
      Date.now() - INITIAL_LOOKBACK_DAYS * 86_400_000
    ).toISOString();

    const { error: upsertError } = await supabase
      .from("gmail_accounts")
      .upsert(
        {
          user_id: user.id,
          google_email: googleEmail,
          refresh_token: tokens.refresh_token,
          status: "active",
          last_synced_at: initialWatermark,
          last_sync_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      console.error("gmail account upsert error", upsertError);
      return redirect(dashboardUrl(user.email, user.dashboard_token, "error"));
    }

    return redirect(dashboardUrl(user.email, user.dashboard_token, "connected"));
  } catch (err) {
    console.error("oauth callback error", err);
    return redirect(dashboardUrl(user.email, user.dashboard_token, "error"));
  }
});
