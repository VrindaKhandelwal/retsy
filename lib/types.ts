export type PurchaseStatus = "pending" | "confirmed" | "returned" | "kept";

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
  created_at?: string;
}
