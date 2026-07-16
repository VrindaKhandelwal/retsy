// confirmed = tracked, undecided · to_return = wants to return, hasn't yet
// "missed" is derived in the UI: an open purchase whose deadline passed.
export type PurchaseStatus =
  | "pending"
  | "confirmed"
  | "to_return"
  | "returned"
  | "kept";

export type PurchaseSource = "forwarded" | "gmail" | "manual";

export interface Purchase {
  id: string;
  retailer: string;
  item_name: string;
  order_date: string | null;
  order_number: string | null;
  order_total: string | null;
  return_deadline: string;
  confidence: number;
  status: PurchaseStatus;
  source?: PurchaseSource;
  delivery_date?: string | null;
  deadline_basis?: "order_date" | "delivery_date";
  // pending = returned, money not seen yet; received = refund email detected
  refund_status?: "pending" | "received" | null;
  refund_amount?: string | null;
  created_at?: string;
}

export interface GmailAccount {
  google_email: string;
  status: "active" | "revoked" | "error";
  last_synced_at: string | null;
  // True while the initial inbox backfill is still being processed.
  sync_backlog?: boolean;
}
