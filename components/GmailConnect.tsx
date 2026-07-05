"use client";

import { useState } from "react";
import { gmailConnectUrl, gmailDisconnect } from "@/lib/api";
import type { GmailAccount } from "@/lib/types";

export default function GmailConnect({
  email,
  token,
  account,
  onDisconnected,
}: {
  email: string;
  token: string;
  account: GmailAccount | null;
  onDisconnected: () => void;
}) {
  const [busy, setBusy] = useState(false);

  function connect() {
    window.location.href = gmailConnectUrl(email, token);
  }

  async function disconnect() {
    setBusy(true);
    const { error } = await gmailDisconnect(email, token);
    setBusy(false);
    if (!error) onDisconnected();
  }

  if (!account) {
    return (
      <div className="mt-6 rounded-lg border border-line bg-white px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-ink">
              Connect your Gmail
            </div>
            <p className="mt-1 text-sm text-inkSoft">
              We&apos;ll check your inbox once a day for new receipts and track
              them automatically. Read-only access — we only look for order
              confirmations.
            </p>
          </div>
          <button
            onClick={connect}
            className="whitespace-nowrap rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper hover:bg-ink/90"
          >
            Connect Gmail
          </button>
        </div>
      </div>
    );
  }

  if (account.status !== "active") {
    return (
      <div className="mt-6 rounded-lg border border-mustard/40 bg-mustard/10 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-ink">
              Gmail connection expired
            </div>
            <p className="mt-1 text-sm text-inkSoft">
              We can no longer read {account.google_email}. Reconnect to keep
              auto-tracking new purchases.
            </p>
          </div>
          <button
            onClick={connect}
            className="whitespace-nowrap rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper hover:bg-ink/90"
          >
            Reconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 flex items-center justify-between rounded-lg border border-sage/40 bg-sage/10 px-5 py-3 text-sm">
      <div>
        <span className="font-semibold text-ink">{account.google_email}</span>
        <span className="text-inkSoft">
          {" "}
          connected
          {account.last_synced_at &&
            ` · last checked ${new Date(account.last_synced_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
        </span>
      </div>
      <button
        disabled={busy}
        onClick={disconnect}
        className="font-medium text-inkSoft hover:text-stamp disabled:opacity-50"
      >
        Disconnect
      </button>
    </div>
  );
}
