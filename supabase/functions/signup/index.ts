// Edge Function: signup
//
// POST { email }
//   -> finds or creates the user, emails them their passwordless dashboard
//      link. Used by both the landing page signup form and a "resend my
//      dashboard link" action.

import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { sendDashboardLinkEmail } from "../_shared/resend.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "https://app.retsy.xyz";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    return jsonResponse({ error: "Enter a valid email address" }, 400);
  }

  const supabase = getSupabaseAdmin();

  const { data: existing, error: lookupError } = await supabase
    .from("users")
    .select("id, email, dashboard_token")
    .eq("email", email)
    .maybeSingle();

  if (lookupError) {
    console.error("user lookup error", lookupError);
    return jsonResponse({ error: "Database error" }, 500);
  }

  let user = existing;
  let isNewUser = false;

  if (!user) {
    const { data: created, error: insertError } = await supabase
      .from("users")
      .insert({ email })
      .select("id, email, dashboard_token")
      .single();

    if (insertError) {
      console.error("user insert error", insertError);
      return jsonResponse({ error: "Database error" }, 500);
    }
    user = created;
    isNewUser = true;
  }

  try {
    await sendDashboardLinkEmail({
      to: user.email,
      dashboardUrl: `${APP_URL}/dashboard?email=${encodeURIComponent(
        user.email
      )}&token=${user.dashboard_token}`,
      isNewUser,
    });
  } catch (err) {
    console.error("dashboard link email error", err);
    return jsonResponse({ error: "Could not send email, try again" }, 500);
  }

  return jsonResponse({ ok: true });
});
