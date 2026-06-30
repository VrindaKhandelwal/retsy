// Edge Function: inbound-email
//
// Configured as the Mailgun inbound routing webhook URL for returns@retsy.xyz.
// Mailgun POSTs a multipart/form-data payload for every email received.
// Docs: https://documentation.mailgun.com/docs/mailgun/user-manual/receive-forward-store/
//
// Flow: parse the forwarded email -> find/create the user by their From
// address -> run OpenAI extraction -> look up the retailer's return window
// -> compute a deadline -> store a `pending` purchase -> email the user a
// confirmation link.

import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { extractPurchaseFromEmail } from "../_shared/openaiExtract.ts";
import { getReturnWindowDays } from "../_shared/retailerPolicies.ts";
import { sendConfirmationEmail, sendParseFailureEmail } from "../_shared/resend.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "https://app.retsy.xyz";

// Check a shared secret query param to reject requests not from Mailgun.
const INBOUND_SECRET = Deno.env.get("INBOUND_SECRET") ?? Deno.env.get("POSTMARK_INBOUND_SECRET");

// Mailgun sends "Name <email@example.com>" — extract just the email.
function parseEmail(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
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

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (INBOUND_SECRET) {
    const url = new URL(req.url);
    if (url.searchParams.get("secret") !== INBOUND_SECRET) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
  }

  // Mailgun posts multipart/form-data or application/x-www-form-urlencoded;
  // fall back to JSON for local curl tests.
  let fromEmail: string;
  let emailText: string;

  const contentType = req.headers.get("content-type") ?? "";
  console.log("inbound content-type:", contentType);

  if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch (e) {
      console.error("formData parse error:", e);
      return jsonResponse({ error: "Invalid form data" }, 400);
    }

    const sender = form.get("sender")?.toString() || form.get("from")?.toString() || "";
    console.log("mailgun sender field:", sender);
    fromEmail = parseEmail(sender);

    const plainText = form.get("body-plain")?.toString() || form.get("stripped-text")?.toString() || "";
    const htmlBody = form.get("body-html")?.toString() || "";
    const subject = form.get("subject")?.toString() || "";
    emailText = plainText.trim() || (htmlBody ? stripHtml(htmlBody) : "") || subject;
  } else {
    // JSON fallback (local testing via curl)
    let payload: { From?: string; FromFull?: { Email?: string }; Subject?: string; TextBody?: string; HtmlBody?: string };
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON payload" }, 400);
    }
    fromEmail = parseEmail(payload.FromFull?.Email || payload.From || "");
    emailText = payload.TextBody?.trim() || (payload.HtmlBody ? stripHtml(payload.HtmlBody) : "") || payload.Subject || "";
  }

  if (!fromEmail) {
    console.error("no sender email found, content-type was:", contentType);
    return jsonResponse({ error: "No sender email found in payload" }, 400);
  }

  const supabase = getSupabaseAdmin();

  // 1. Find or create the user.
  const { data: existingUser, error: userLookupError } = await supabase
    .from("users")
    .select("id, email")
    .eq("email", fromEmail)
    .maybeSingle();

  if (userLookupError) {
    console.error("user lookup error", userLookupError);
    return jsonResponse({ error: "Database error" }, 500);
  }

  let userId = existingUser?.id;
  if (!userId) {
    const { data: newUser, error: insertUserError } = await supabase
      .from("users")
      .insert({ email: fromEmail })
      .select("id")
      .single();

    if (insertUserError) {
      console.error("user insert error", insertUserError);
      return jsonResponse({ error: "Database error" }, 500);
    }
    userId = newUser.id;
  }

  // 2. Run AI extraction.
  let extracted;
  try {
    extracted = await extractPurchaseFromEmail(emailText, fromEmail);
  } catch (err) {
    console.error("extraction error", err);
    // Don't fail the webhook (Mailgun will retry) — tell the user instead.
    await sendParseFailureEmail({ to: fromEmail }).catch((e) =>
      console.error("failed to send parse-failure email", e)
    );
    return jsonResponse({ ok: true, extracted: false });
  }

  // Low-confidence / empty extraction: still create the purchase (status
  // pending, low confidence) so the user can fix it on the confirm page,
  // rather than silently dropping their email.
  const orderDate = extracted.order_date || todayIso();
  const { windowDays } = await getReturnWindowDays(supabase, extracted.retailer);
  const returnDeadline = addDays(orderDate, windowDays);

  const { data: purchase, error: insertPurchaseError } = await supabase
    .from("purchases")
    .insert({
      user_id: userId,
      retailer: extracted.retailer,
      item_name: extracted.item_name,
      order_date: orderDate,
      order_number: extracted.order_number,
      order_total: extracted.order_total,
      return_deadline: returnDeadline,
      confidence: extracted.confidence,
      status: "pending",
      raw_email_text: emailText.slice(0, 20000),
    })
    .select("id, confirm_token")
    .single();

  if (insertPurchaseError) {
    console.error("purchase insert error", insertPurchaseError);
    return jsonResponse({ error: "Database error" }, 500);
  }

  // 3. Email the user to confirm.
  try {
    await sendConfirmationEmail({
      to: fromEmail,
      retailer: extracted.retailer,
      itemName: extracted.item_name,
      orderTotal: extracted.order_total,
      returnDeadline,
      confirmUrl: `${APP_URL}/confirm/${purchase.id}?token=${purchase.confirm_token}`,
    });
  } catch (err) {
    console.error("confirmation email error", err);
    // The purchase still exists; user can find it from a future dashboard
    // visit even if this email failed. Don't 500 — Mailgun would retry
    // and create duplicate purchases.
  }

  return jsonResponse({ ok: true, purchase_id: purchase.id });
});
