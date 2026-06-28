import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Service-role client — used only inside Edge Functions, never exposed to
// the browser. Bypasses RLS, which is intentional: V1 has no end-user auth,
// so every table is locked down at the RLS level and only Edge Functions
// (which apply their own checks, e.g. matching a confirm_token) can write.
export function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars"
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
