"use client";

import { useEffect, useState } from "react";
import { listPurchases, updateStatus } from "@/lib/api";
import type { GmailAccount, Purchase, PurchaseStatus } from "@/lib/types";

export type StatusAction =
  | "returned"
  | "kept"
  | "delete"
  | "to_return"
  | "undecided";

const STATUS_AFTER_ACTION: Record<Exclude<StatusAction, "delete">, PurchaseStatus> = {
  returned: "returned",
  kept: "kept",
  to_return: "to_return",
  undecided: "confirmed",
};

// Shared load/act state for the dashboard (and its design previews):
// fetches purchases + gmail account, applies optimistic status updates.
export function useDashboardData(email: string, token: string) {
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [gmailAccount, setGmailAccount] = useState<GmailAccount | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    const { data, error } = await listPurchases(email, token);
    if (error || !data) {
      setLoadError(error || "Couldn't load your dashboard.");
    } else {
      setPurchases(data.purchases);
      setGmailAccount(data.gmail_account ?? null);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(id: string, action: StatusAction) {
    setBusyId(id);
    const { error } = await updateStatus(email, token, id, action);
    if (!error) {
      setPurchases((prev) =>
        action === "delete"
          ? prev?.filter((p) => p.id !== id) ?? null
          : prev?.map((p) =>
              p.id === id ? { ...p, status: STATUS_AFTER_ACTION[action] } : p
            ) ?? null
      );
    }
    setBusyId(null);
  }

  return { purchases, gmailAccount, setGmailAccount, loadError, busyId, act };
}
