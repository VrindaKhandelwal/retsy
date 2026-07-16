"use client";

import { useState } from "react";
import { gmailConnectUrl, gmailDisconnect } from "@/lib/api";
import type { GmailAccount } from "@/lib/types";

// Compact horizontal Gmail status/control for the dashboard's top nav bar.
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
      <div
        onClick={connect}
        title="We'll spot new receipts once a day, automatically. Read-only."
        style={{ background: "linear-gradient(140deg, #e8749a, #d94f7d)", color: "#fff", fontSize: 13, fontWeight: 700, padding: "9px 16px", borderRadius: 11, cursor: "pointer", boxShadow: "0 6px 16px rgba(217,79,125,0.25)", whiteSpace: "nowrap" }}
      >
        Connect Gmail
      </div>
    );
  }

  if (account.status !== "active") {
    return (
      <div
        onClick={connect}
        title={`We can no longer read ${account.google_email} — reconnect to keep auto-tracking.`}
        style={{ background: "#faf1de", border: "1px solid #ecd9a8", color: "#a97c1d", fontSize: 13, fontWeight: 700, padding: "8px 15px", borderRadius: 11, cursor: "pointer", whiteSpace: "nowrap" }}
      >
        Reconnect Gmail
      </div>
    );
  }

  return (
    <div
      title={`${account.google_email}${account.last_synced_at ? ` · last checked ${new Date(account.last_synced_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}`}
      style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #f1e2e3", borderRadius: 11, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#5fb897", flexShrink: 0 }} />
      Gmail connected
      <button
        disabled={busy}
        onClick={disconnect}
        style={{ border: "none", background: "transparent", padding: 0, fontSize: 12, fontWeight: 600, color: "#c2b4b9", cursor: "pointer" }}
      >
        Disconnect
      </button>
    </div>
  );
}
