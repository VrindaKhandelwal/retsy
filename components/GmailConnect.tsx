"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
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
      <div className="rounded-xl border border-stone-200 bg-white px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-stone-800">
              <Mail size={14} /> Connect your Gmail
            </div>
            <p className="mt-1 text-sm text-stone-500">
              We&apos;ll check your inbox once a day for new receipts and track
              them automatically. Read-only access — we only look for order
              confirmations.
            </p>
          </div>
          <button
            onClick={connect}
            className="whitespace-nowrap rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700"
          >
            Connect Gmail
          </button>
        </div>
      </div>
    );
  }

  if (account.status !== "active") {
    return (
      <div className="rounded-xl bg-amber-50 px-5 py-4 ring-1 ring-amber-200">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-amber-900">
              Gmail connection expired
            </div>
            <p className="mt-1 text-sm text-amber-800/80">
              We can no longer read {account.google_email}. Reconnect to keep
              auto-tracking new purchases.
            </p>
          </div>
          <button
            onClick={connect}
            className="whitespace-nowrap rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700"
          >
            Reconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-xl bg-white px-5 py-3 text-sm ring-1 ring-stone-200">
      <div className="flex items-center gap-2">
        <Mail size={14} className="text-emerald-600" />
        <span className="font-medium text-stone-800">{account.google_email}</span>
        <span className="text-stone-400">
          connected
          {account.last_synced_at &&
            ` · last checked ${new Date(account.last_synced_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
        </span>
      </div>
      <button
        disabled={busy}
        onClick={disconnect}
        className="font-medium text-stone-400 hover:text-red-500 disabled:opacity-50"
      >
        Disconnect
      </button>
    </div>
  );
}
