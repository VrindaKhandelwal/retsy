"use client";

import { useState } from "react";
import { gmailConnectUrl, gmailDisconnect } from "@/lib/api";
import type { GmailAccount } from "@/lib/types";

// Compact card styled for the dashboard sidebar (blush palette from the
// Claude Design export).
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
      <div style={{ background: "#fff", border: "1px solid #f1e2e3", borderRadius: 16, padding: 15 }}>
        <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 15, lineHeight: 1.25, marginBottom: 4 }}>
          Connect your Gmail
        </div>
        <div style={{ fontSize: 12, color: "#9a8c92", lineHeight: 1.4, marginBottom: 12 }}>
          We&apos;ll spot new receipts once a day, automatically. Read-only.
        </div>
        <div
          onClick={connect}
          style={{ background: "linear-gradient(140deg, #e8749a, #d94f7d)", color: "#fff", textAlign: "center", fontSize: 13, fontWeight: 600, padding: 9, borderRadius: 10, cursor: "pointer", boxShadow: "0 6px 16px rgba(217,79,125,0.25)" }}
        >
          Connect Gmail
        </div>
      </div>
    );
  }

  if (account.status !== "active") {
    return (
      <div style={{ background: "#faf1de", border: "1px solid #ecd9a8", borderRadius: 16, padding: 15 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#a97c1d", marginBottom: 4 }}>
          Gmail connection expired
        </div>
        <div style={{ fontSize: 12, color: "#a98f56", lineHeight: 1.4, marginBottom: 12 }}>
          We can no longer read {account.google_email}.
        </div>
        <div
          onClick={connect}
          style={{ background: "#2e2530", color: "#fff", textAlign: "center", fontSize: 13, fontWeight: 600, padding: 9, borderRadius: 10, cursor: "pointer" }}
        >
          Reconnect
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #f1e2e3", borderRadius: 16, padding: "12px 15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#5fb897", flexShrink: 0 }} />
        Gmail connected
      </div>
      <div style={{ fontSize: 11.5, color: "#9a8c92", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {account.google_email}
        {account.last_synced_at &&
          ` · checked ${new Date(account.last_synced_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
      </div>
      <button
        disabled={busy}
        onClick={disconnect}
        style={{ marginTop: 8, border: "none", background: "transparent", padding: 0, fontSize: 11.5, fontWeight: 600, color: "#c2b4b9", cursor: "pointer" }}
      >
        Disconnect
      </button>
    </div>
  );
}
