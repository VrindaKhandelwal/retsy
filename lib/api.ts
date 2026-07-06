// All write/read access to the database from the browser goes through
// Supabase Edge Functions (see /supabase/functions) rather than a direct
// Supabase client, since V1 has no end-user auth and every table denies
// anonymous access at the RLS level.

const FUNCTIONS_URL =
  process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL ||
  "http://localhost:54321/functions/v1";

async function call<T>(
  path: string,
  options?: RequestInit
): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch(`${FUNCTIONS_URL}/${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: json.error || `Request failed (${res.status})` };
    }
    return { data: json as T };
  } catch (err) {
    console.error(err);
    return { error: "Network error — please try again." };
  }
}

export function signup(email: string) {
  return call<{ ok: true }>("signup", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function getPurchase(id: string, token: string) {
  return call<{ purchase: any }>(
    `confirm-purchase?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`
  );
}

export function confirmPurchase(
  id: string,
  token: string,
  edits: Record<string, unknown>
) {
  return call<{ purchase: any }>("confirm-purchase", {
    method: "POST",
    body: JSON.stringify({ id, token, ...edits }),
  });
}

export function listPurchases(email: string, token: string) {
  return call<{ purchases: any[]; gmail_account: any | null }>(
    `list-purchases?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`
  );
}

// Used as a navigation target (window.location), not a fetch — the function
// responds with a 302 to Google's consent screen.
export function gmailConnectUrl(email: string, token: string) {
  return `${FUNCTIONS_URL}/gmail-oauth-start?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
}

export function gmailDisconnect(email: string, token: string) {
  return call<{ ok: true }>("gmail-disconnect", {
    method: "POST",
    body: JSON.stringify({ email, token }),
  });
}

export function updateStatus(
  email: string,
  token: string,
  purchaseId: string,
  action: "returned" | "kept" | "delete" | "to_return" | "undecided"
) {
  return call<{ ok: true }>("update-status", {
    method: "POST",
    body: JSON.stringify({ email, token, purchase_id: purchaseId, action }),
  });
}
