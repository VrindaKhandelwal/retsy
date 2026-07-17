// Google OAuth + Gmail API plumbing for the V2 auto-detection flow.
// Plain fetch against Google's REST endpoints — no SDK, matching the rest
// of the codebase.

const OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const OAUTH_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

// profile adds the user's real name to the id_token for the dashboard greeting.
const SCOPES = "https://www.googleapis.com/auth/gmail.readonly openid email profile";

// Thrown when Google reports invalid_grant — the user revoked access, or
// the refresh token expired (7 days while the OAuth app is in Testing).
export class GmailAuthRevokedError extends Error {
  constructor(message = "Gmail refresh token revoked or expired") {
    super(message);
    this.name = "GmailAuthRevokedError";
  }
}

function getClientCredentials() {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET env vars");
  }
  return { clientId, clientSecret };
}

export function getRedirectUri(): string {
  return (
    Deno.env.get("GOOGLE_REDIRECT_URI") ||
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/gmail-oauth-callback`
  );
}

// access_type=offline + prompt=consent are both required: without them
// Google omits the refresh_token on repeat authorizations.
export function buildAuthUrl(state: string): string {
  const { clientId } = getClientCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${OAUTH_AUTH_URL}?${params}`;
}

export async function exchangeCode(code: string): Promise<{
  refresh_token: string;
  access_token: string;
  id_token: string;
  // Space-separated scopes the user actually granted — granular consent
  // means checkboxes can be left unchecked, so never assume.
  scope?: string;
}> {
  const { clientId, clientSecret } = getClientCredentials();
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google code exchange failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  if (!data.refresh_token) {
    throw new Error("Google did not return a refresh_token");
  }
  return data;
}

// The id_token came straight from Google's token endpoint over TLS, so we
// can read its payload without signature verification.
export function parseIdTokenClaims(idToken: string): {
  email: string;
  fullName: string | null;
} {
  const payload = idToken.split(".")[1];
  const decoded = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(payload))
  );
  const email = (decoded.email || "").toLowerCase();
  if (!email) {
    throw new Error("id_token has no email claim");
  }
  return { email, fullName: decoded.name?.toString().trim() || null };
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = getClientCredentials();
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (errText.includes("invalid_grant")) {
      throw new GmailAuthRevokedError();
    }
    throw new Error(`Google token refresh failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.access_token;
}

// Best-effort: revoking an already-revoked token 400s, which is fine.
export async function revokeToken(refreshToken: string): Promise<void> {
  await fetch(`${OAUTH_REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, {
    method: "POST",
  }).catch((e) => console.error("token revoke failed", e));
}

// Paginates until maxResults ids are collected or the query is exhausted.
// Newest first (Gmail's order).
export async function listMessageIds(
  accessToken: string,
  q: string,
  maxResults: number
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  while (ids.length < maxResults) {
    const params = new URLSearchParams({
      q,
      maxResults: String(Math.min(maxResults - ids.length, 100)),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${GMAIL_API_BASE}/messages?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gmail messages.list failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    ids.push(...(data.messages ?? []).map((m: { id: string }) => m.id));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return ids;
}

export interface GmailMessage {
  id: string;
  from: string;
  subject: string;
  dateHeader: string | null;
  internalDateMs: number; // Gmail's own received timestamp
  // "Subject: ...\nFrom: ...\n\n<body>" — the shape extractPurchaseFromEmail expects
  text: string;
}

export async function getMessage(
  accessToken: string,
  id: string
): Promise<GmailMessage> {
  const res = await fetch(`${GMAIL_API_BASE}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gmail messages.get failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const headers: { name: string; value: string }[] = data.payload?.headers ?? [];
  const header = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

  const from = header("From");
  const subject = header("Subject");
  const dateHeader = header("Date") || null;

  const body = extractEmailText(data.payload) || subject;
  return {
    id,
    from,
    subject,
    dateHeader,
    internalDateMs: Number(data.internalDate) || Date.now(),
    text: `Subject: ${subject}\nFrom: ${from}\n\n${body}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// MIME body extraction
// ─────────────────────────────────────────────────────────────────────────

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function base64UrlDecode(data: string): Uint8Array {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodePartBody(part: GmailPart): string {
  const data = part.body?.data;
  if (!data) return "";
  try {
    return new TextDecoder().decode(base64UrlDecode(data));
  } catch (e) {
    console.error("gmail body decode failed", e);
    return "";
  }
}

// Walk the (possibly nested) MIME tree collecting text/plain and text/html
// bodies; prefer plain text, fall back to stripped HTML.
export function extractEmailText(payload: GmailPart | undefined): string {
  if (!payload) return "";

  let plain = "";
  let html = "";

  function walk(part: GmailPart) {
    const mime = part.mimeType ?? "";
    if (mime === "text/plain") {
      plain += decodePartBody(part) + "\n";
    } else if (mime === "text/html") {
      html += decodePartBody(part);
    }
    for (const child of part.parts ?? []) {
      walk(child);
    }
  }
  walk(payload);

  return plain.trim() || (html ? stripHtml(html) : "");
}
