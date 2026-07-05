export type PurchaseStatus = "pending" | "confirmed" | "returned" | "kept";

export type PurchaseSource = "forwarded" | "gmail";

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
  created_at?: string;
}

export interface GmailAccount {
  google_email: string;
  status: "active" | "revoked" | "error";
  last_synced_at: string | null;
}
