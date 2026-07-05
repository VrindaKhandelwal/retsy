export interface ExtractedPurchase {
  retailer: string;
  item_name: string;
  order_date: string | null; // ISO yyyy-mm-dd or null if not found
  order_number: string | null;
  order_total: string | null; // e.g. "$45.99" or null if not found
  confidence: number; // 0.0 - 1.0, model's own estimate of extraction quality
  // True only for returnable physical merchandise. False for shipping
  // updates, refunds, marketing — and for purchases with no return window:
  // food delivery, rides, financial trades, subscriptions, tickets.
  // Defaults to true when the model omits it, so the V1 forwarding flow
  // (where the user vouched for the email by forwarding it) is unaffected.
  is_returnable_purchase: boolean;
  // Delivery notifications don't create purchases; gmail-sync uses them to
  // set delivery_date on the matching purchase and recompute its deadline.
  email_type: "order_confirmation" | "delivery_notification" | "other";
  delivery_date: string | null; // ISO yyyy-mm-dd, delivery notifications only
}

const SYSTEM_PROMPT = `You extract structured purchase information from forwarded order
confirmation / receipt emails. The emails are messy: they may include forwarding
headers, marketing content, HTML-to-text artifacts, and unrelated boilerplate.

Return ONLY a JSON object with exactly these fields, nothing else:
{
  "retailer": string,        // the store/brand name, e.g. "Amazon", "Zara", "Target". Best guess, title case.
  "item_name": string,       // name of the main item. If multiple items, use the format "Main Item, etc." (e.g. "Running Shoes, etc.").
  "order_date": string|null, // ISO 8601 date (YYYY-MM-DD) the order was placed. Null if you cannot find one.
  "order_number": string|null, // order/confirmation number as printed in the email. Null if not present.
  "order_total": string|null, // total amount paid for the order, as printed (e.g. "$45.99", "£32.00"). Null if not present.
  "confidence": number,      // your own confidence (0.0 to 1.0) that the above fields are correct and complete
  "is_returnable_purchase": boolean, // see rules below
  "email_type": string,      // "order_confirmation" | "delivery_notification" | "other" — see rules below
  "delivery_date": string|null // ISO 8601 date (YYYY-MM-DD) the package was delivered, ONLY for delivery notifications. Null otherwise or if not stated.
}

email_type rules:
- "order_confirmation": a purchase/order confirmation or receipt.
- "delivery_notification": a shipping-carrier or retailer email saying a package
  WAS DELIVERED (not merely shipped or out for delivery). Extract the retailer,
  order_number if present, and delivery_date (null if the exact date isn't stated).
- "other": everything else — shipped/out-for-delivery updates, returns, refunds,
  marketing, and anything that is neither of the above.

is_returnable_purchase must be true ONLY when BOTH hold:
1. email_type is "order_confirmation".
2. The purchase is physical merchandise that could plausibly be returned to the
   retailer (clothing, electronics, home goods, etc.).
It must be false for purchases with no meaningful return window: restaurant and
food delivery orders (Uber Eats, DoorDash, etc.), groceries, rideshare and travel
bookings, financial transactions (stock/crypto trades, transfers, Robinhood etc.),
digital subscriptions and services, software, event tickets, donations, and bills.

Rules:
- If you cannot confidently identify a retailer, use your best guess and lower the confidence score.
- Never invent an order number, date, or total — use null if it isn't clearly present in the text.
- order_total should be the final amount charged including tax/shipping, not a subtotal.
- confidence should reflect genuine uncertainty: a clean, unambiguous order confirmation email should score 0.85+; a vague or fragmentary forward should score well below 0.5.
- Output valid JSON only. No markdown fences, no commentary.`;

export async function extractPurchaseFromEmail(
  emailText: string,
  fromAddress: string
): Promise<ExtractedPurchase> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY env var");
  }

  // Truncate extremely long emails to keep cost/latency bounded — receipts
  // rarely need more than this to extract the key fields.
  const truncated = emailText.slice(0, 12000);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Sender address: ${fromAddress}\n\nEmail content:\n${truncated}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI extraction failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned no content");
  }

  let parsed: Partial<ExtractedPurchase>;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`OpenAI returned non-JSON content: ${content}`);
  }

  return {
    retailer: parsed.retailer?.toString().trim() || "Unknown",
    item_name: parsed.item_name?.toString().trim() || "Unknown item",
    order_date: parsed.order_date || null,
    order_number: parsed.order_number || null,
    order_total: parsed.order_total?.toString().trim() || null,
    confidence:
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.4,
    is_returnable_purchase:
      typeof parsed.is_returnable_purchase === "boolean"
        ? parsed.is_returnable_purchase
        : true,
    email_type:
      parsed.email_type === "delivery_notification" || parsed.email_type === "other"
        ? parsed.email_type
        : "order_confirmation",
    delivery_date: parsed.delivery_date || null,
  };
}
