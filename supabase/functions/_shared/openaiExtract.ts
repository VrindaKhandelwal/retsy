export interface ExtractedPurchase {
  retailer: string;
  item_name: string;
  order_date: string | null; // ISO yyyy-mm-dd or null if not found
  order_number: string | null;
  confidence: number; // 0.0 - 1.0, model's own estimate of extraction quality
}

const SYSTEM_PROMPT = `You extract structured purchase information from forwarded order
confirmation / receipt emails. The emails are messy: they may include forwarding
headers, marketing content, HTML-to-text artifacts, and unrelated boilerplate.

Return ONLY a JSON object with exactly these fields, nothing else:
{
  "retailer": string,        // the store/brand name, e.g. "Amazon", "Zara", "Target". Best guess, title case.
  "item_name": string,       // short human-readable name of the main item purchased. If multiple items, summarize briefly (e.g. "3 items incl. Running Shoes").
  "order_date": string|null, // ISO 8601 date (YYYY-MM-DD) the order was placed. Null if you cannot find one.
  "order_number": string|null, // order/confirmation number as printed in the email. Null if not present.
  "confidence": number       // your own confidence (0.0 to 1.0) that the above fields are correct and complete
}

Rules:
- If you cannot confidently identify a retailer, use your best guess and lower the confidence score.
- Never invent an order number or date — use null if it isn't clearly present in the text.
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
    confidence:
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.4,
  };
}
