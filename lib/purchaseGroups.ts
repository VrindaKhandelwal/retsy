import type { Purchase } from "./types";

// The dashboard's five user-facing states. "missed" is derived: an open
// purchase whose return window already closed.
export type Bucket = "to_return" | "deciding" | "missed" | "returned" | "kept";

export function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(dateStr + "T00:00:00");
  return Math.round((deadline.getTime() - today.getTime()) / 86_400_000);
}

export function bucketOf(p: Purchase): Bucket {
  if (p.status === "returned") return "returned";
  if (p.status === "kept") return "kept";
  if (daysUntil(p.return_deadline) < 0) return "missed";
  if (p.status === "to_return") return "to_return";
  return "deciding"; // pending or confirmed, window still open
}

export interface Grouped {
  to_return: Purchase[];
  deciding: Purchase[];
  missed: Purchase[];
  returned: Purchase[];
  kept: Purchase[];
}

export function groupPurchases(purchases: Purchase[]): Grouped {
  const g: Grouped = { to_return: [], deciding: [], missed: [], returned: [], kept: [] };
  for (const p of purchases) {
    g[bucketOf(p)].push(p);
  }
  const byDeadline = (a: Purchase, b: Purchase) =>
    a.return_deadline.localeCompare(b.return_deadline);
  g.to_return.sort(byDeadline);
  g.deciding.sort(byDeadline);
  g.missed.sort((a, b) => b.return_deadline.localeCompare(a.return_deadline));
  return g;
}

// Sum of order totals for a set of purchases, for "$ at stake" copy.
// Totals are stored as printed ("$45.99"); non-dollar or missing amounts
// are skipped rather than guessed.
export function dollarsAtStake(purchases: Purchase[]): number | null {
  let sum = 0;
  let found = false;
  for (const p of purchases) {
    const m = p.order_total?.match(/^\$\s*([\d,]+(?:\.\d{1,2})?)$/);
    if (m) {
      sum += parseFloat(m[1].replace(/,/g, ""));
      found = true;
    }
  }
  return found ? sum : null;
}

export function formatDeadline(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// 0 → just ordered/delivered, 1 → window closed. For progress bars.
export function windowProgress(p: Purchase): number {
  const start = p.delivery_date || p.order_date;
  if (!start) return 0;
  const startMs = new Date(start + "T00:00:00").getTime();
  const endMs = new Date(p.return_deadline + "T00:00:00").getTime();
  if (endMs <= startMs) return 1;
  return Math.min(1, Math.max(0, (Date.now() - startMs) / (endMs - startMs)));
}
