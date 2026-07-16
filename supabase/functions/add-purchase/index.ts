// Edge Function: add-purchase
//
// POST { email, token, item_name, retailer, return_deadline, order_total?, order_date? }
//   -> validates the dashboard token, inserts a manual purchase (already
//      'confirmed' — the user typed it, no confirmation loop needed), and
//      schedules its reminders.

import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { scheduleReminders } from "../_shared/reminders.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: {
    email?: string;
    token?: string;
    item_name?: string;
    retailer?: string;
    return_deadline?: string;
    order_total?: string;
    order_date?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const email = (body.email || "").trim().toLowerCase();
  const itemName = (body.item_name || "").trim();
  const retailer = (body.retailer || "").trim();
  const deadline = (body.return_deadline || "").trim();

  if (!email || !body.token || !itemName || !retailer || !deadline) {
    return jsonResponse({ error: "Missing required fields" }, 400);
  }
  if (!ISO_DATE.test(deadline) || (body.order_date && !ISO_DATE.test(body.order_date))) {
    return jsonResponse({ error: "Dates must be YYYY-MM-DD" }, 400);
  }

  const supabase = getSupabaseAdmin();

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, dashboard_token")
    .eq("email", email)
    .maybeSingle();

  if (userError || !user || user.dashboard_token !== body.token) {
    return jsonResponse({ error: "Invalid link" }, 401);
  }

  const { data: purchase, error: insertError } = await supabase
    .from("purchases")
    .insert({
      user_id: user.id,
      retailer,
      item_name: itemName,
      order_date: body.order_date || null,
      order_total: body.order_total?.trim() || null,
      return_deadline: deadline,
      confidence: 1.0, // the user typed it themselves
      status: "confirmed",
      source: "manual",
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("manual purchase insert error", insertError);
    return jsonResponse({ error: "Database error" }, 500);
  }

  await scheduleReminders(supabase, purchase.id, deadline);

  return jsonResponse({ ok: true, purchase_id: purchase.id });
});
