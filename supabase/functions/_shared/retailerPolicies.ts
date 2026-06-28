// Simple static fallback table. The source of truth is the
// `retailer_policies` Postgres table (editable without a deploy); this file
// is used only as a seed and as an in-memory fallback if the DB lookup
// fails for some reason.

export const DEFAULT_RETURN_WINDOW_DAYS = 30;

export const RETAILER_POLICIES: Record<string, number> = {
  amazon: 30,
  zara: 30,
  target: 90,
};

export function normalizeRetailerName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Looks up the return window (in days) for a retailer, preferring the
 * database table (so it can be edited live) and falling back to the
 * static table, and finally to the default of 30 days for unknown
 * retailers.
 */
export async function getReturnWindowDays(
  supabase: any,
  retailerRaw: string
): Promise<{ windowDays: number; isKnownRetailer: boolean }> {
  const retailer = normalizeRetailerName(retailerRaw || "");

  if (!retailer) {
    return { windowDays: DEFAULT_RETURN_WINDOW_DAYS, isKnownRetailer: false };
  }

  const { data, error } = await supabase
    .from("retailer_policies")
    .select("window_days")
    .eq("retailer", retailer)
    .maybeSingle();

  if (!error && data) {
    return { windowDays: data.window_days, isKnownRetailer: true };
  }

  if (retailer in RETAILER_POLICIES) {
    return { windowDays: RETAILER_POLICIES[retailer], isKnownRetailer: true };
  }

  return { windowDays: DEFAULT_RETURN_WINDOW_DAYS, isKnownRetailer: false };
}
