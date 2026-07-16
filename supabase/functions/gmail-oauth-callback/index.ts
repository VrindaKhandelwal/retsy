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
import { exchangeCode, parseIdTokenClaims } from "../_shared/gmail.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "https://app.retsy.xyz";
const STATE_MAX_AGE_MS = 15 * 60 * 1000;
// How far back the first sync looks for receipts.
const INITIAL_LOOKBACK_DAYS = 30;

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}

// `reason` shows up in the URL on failure so problems are diagnosable
// from the user's address bar without server log access.
function dashboardUrl(
  email: string,
  token: string,
  gmailFlag: string,
  reason?: string
): string {
  const base = `${APP_URL}/dashboard?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}&gmail=${gmailFlag}`;
  return reason ? `${base}&reason=${encodeURIComponent(reason)}` : base;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (!state) {
    return redirect(`${APP_URL}/dashboard?gmail=error&reason=no_state`);
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
    return redirect(`${APP_URL}/dashboard?gmail=error&reason=state_invalid`);
  }

  // We need the user's email + dashboard token to send them back to a
  // working dashboard URL, whatever happens next.
  const { data: user } = await supabase
    .from("users")
    .select("id, email, dashboard_token")
    .eq("id", stateRow.user_id)
    .maybeSingle();

  if (!user) {
    return redirect(`${APP_URL}/dashboard?gmail=error&reason=no_user`);
  }

  if (oauthError || !code) {
    // User declined the consent screen.
    return redirect(
      dashboardUrl(user.email, user.dashboard_token, "error", `denied_${oauthError || "no_code"}`)
    );
  }

  try {
    const tokens = await exchangeCode(code);
    const claims = parseIdTokenClaims(tokens.id_token);
    const googleEmail = claims.email;

    // Capture the user's real name for the dashboard greeting (best-effort).
    if (claims.fullName) {
      await supabase
        .from("users")
        .update({ full_name: claims.fullName })
        .eq("id", user.id);
    }

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
          // The 30-day backfill starts immediately; the dashboard shows a
          // "still syncing" banner until gmail-sync clears this.
          sync_backlog: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      console.error("gmail account upsert error", upsertError);
      return redirect(dashboardUrl(user.email, user.dashboard_token, "error", "db_upsert"));
    }

    // Kick off the first sync immediately (30-day backfill) instead of
    // waiting for the daily cron, so the dashboard populates right after
    // connecting. waitUntil keeps the function alive past the redirect;
    // the sync itself is idempotent so overlapping with cron is harmless.
    const syncRequest = fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/gmail-sync`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "",
        },
        body: "{}",
      }
    ).catch((e) => console.error("post-connect sync trigger failed", e));

    // deno-lint-ignore no-explicit-any
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime?.waitUntil) {
      runtime.waitUntil(syncRequest);
    } else {
      await syncRequest;
    }

    return redirect(dashboardUrl(user.email, user.dashboard_token, "connected"));
  } catch (err) {
    console.error("oauth callback error", err);
    const msg = String(err instanceof Error ? err.message : err)
      .slice(0, 120)
      .replace(/[^a-zA-Z0-9 _():./-]/g, "");
    return redirect(
      dashboardUrl(user.email, user.dashboard_token, "error", `exchange: ${msg}`)
    );
  }
});
