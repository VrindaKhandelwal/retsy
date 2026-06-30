"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { listPurchases, updateStatus, signup } from "@/lib/api";
import type { Purchase } from "@/lib/types";

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(dateStr + "T00:00:00");
  return Math.round((deadline.getTime() - today.getTime()) / 86_400_000);
}

function urgencyStyles(days: number) {
  if (days < 0) return { text: "text-stamp", bg: "bg-stamp/10", label: "Window closed" };
  if (days <= 3) return { text: "text-stamp", bg: "bg-stamp/10", label: `${days} day${days === 1 ? "" : "s"} left` };
  if (days <= 10) return { text: "text-mustard", bg: "bg-mustard/10", label: `${days} days left` };
  return { text: "text-sage", bg: "bg-sage/10", label: `${days} days left` };
}

function DashboardPageInner() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const token = searchParams.get("token") || "";

  if (!email || !token) {
    return <RequestLinkScreen />;
  }

  return <Dashboard email={email} token={token} />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center px-6"><p className="text-inkSoft">Loading…</p></main>}>
      <DashboardPageInner />
    </Suspense>
  );
}

function RequestLinkScreen() {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    const { error } = await signup(value);
    setStatus(error ? "error" : "done");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-sm font-semibold uppercase tracking-[0.15em] text-inkSoft">
          Retsy
        </div>
        <h1 className="mt-6 font-display text-2xl font-semibold text-ink">
          Find your dashboard
        </h1>
        <p className="mt-2 text-sm text-inkSoft">
          Enter the email you forward receipts from and we&apos;ll send you a
          link.
        </p>
        {status === "done" ? (
          <div className="mt-6 rounded-lg border border-sage/40 bg-sage/10 px-4 py-3 text-sm">
            Check your inbox for the link.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
            <input
              type="email"
              required
              placeholder="you@email.com"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-md border border-line bg-white px-4 py-3 text-base focus:border-ink focus:outline-none"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="rounded-md bg-ink px-6 py-3 text-base font-semibold text-paper hover:bg-ink/90 disabled:opacity-60"
            >
              {status === "loading" ? "Sending…" : "Email me a link"}
            </button>
            {status === "error" && (
              <p className="text-sm text-stamp">
                Couldn&apos;t send that — check the address and try again.
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}

function Dashboard({ email, token }: { email: string; token: string }) {
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    const { data, error } = await listPurchases(email, token);
    if (error || !data) {
      setLoadError(error || "Couldn't load your dashboard.");
    } else {
      setPurchases(data.purchases);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAction(id: string, action: "returned" | "kept" | "delete") {
    setBusyId(id);
    const { error } = await updateStatus(email, token, id, action);
    if (!error) {
      setPurchases((prev) =>
        action === "delete"
          ? prev?.filter((p) => p.id !== id) ?? null
          : prev?.map((p) => (p.id === id ? { ...p, status: action === "returned" ? "returned" : "kept" } : p)) ?? null
      );
    }
    setBusyId(null);
  }

  if (loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="max-w-sm text-center text-stamp">{loadError}</p>
      </main>
    );
  }

  if (!purchases) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-inkSoft">Loading…</p>
      </main>
    );
  }

  const active = purchases
    .filter((p) => p.status === "pending" || p.status === "confirmed")
    .sort((a, b) => a.return_deadline.localeCompare(b.return_deadline));
  const resolved = purchases.filter((p) => p.status === "returned" || p.status === "kept");

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="text-sm font-semibold uppercase tracking-[0.15em] text-inkSoft">
        Retsy
      </div>
      <h1 className="mt-6 font-display text-2xl font-semibold text-ink">
        Your returns
      </h1>
      <p className="mt-1 text-sm text-inkSoft">{email}</p>

      {active.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-line bg-white/60 px-6 py-10 text-center">
          <p className="text-inkSoft">
            Nothing tracked yet. Forward an order confirmation to{" "}
            <strong className="text-ink">returns@retsy.xyz</strong> to
            get started.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {active.map((p) => (
            <PurchaseCard
              key={p.id}
              purchase={p}
              busy={busyId === p.id}
              onAction={(action) => handleAction(p.id, action)}
            />
          ))}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="mt-12">
          <div className="text-xs font-semibold uppercase tracking-wide text-inkSoft">
            Resolved
          </div>
          <div className="mt-4 space-y-2">
            {resolved.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-md border border-line bg-white/40 px-4 py-3 text-sm"
              >
                <div>
                  <span className="font-medium text-ink">{p.item_name}</span>
                  <span className="text-inkSoft"> · {p.retailer}</span>
                </div>
                <span className="text-xs font-semibold uppercase tracking-wide text-inkSoft">
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

function PurchaseCard({
  purchase,
  busy,
  onAction,
}: {
  purchase: Purchase;
  busy: boolean;
  onAction: (action: "returned" | "kept" | "delete") => void;
}) {
  const days = daysUntil(purchase.return_deadline);
  const urgency = urgencyStyles(days);
  const needsConfirmation = purchase.status === "pending";

  return (
    <div className="rounded-lg border border-line bg-white px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-display text-lg font-semibold text-ink">
            {purchase.item_name}
          </div>
          <div className="text-sm text-inkSoft">{purchase.retailer}</div>
        </div>
        <span
          className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${urgency.bg} ${urgency.text}`}
        >
          {urgency.label}
        </span>
      </div>

      <div className="mt-2 font-mono text-xs text-inkSoft">
        Return by{" "}
        {new Date(purchase.return_deadline + "T00:00:00").toLocaleDateString(
          "en-US",
          { month: "short", day: "numeric", year: "numeric" }
        )}
      </div>

      {needsConfirmation && (
        <div className="mt-3 rounded-md bg-mustard/10 px-3 py-2 text-xs font-medium text-mustard">
          Awaiting your confirmation by email
        </div>
      )}

      <div className="mt-4 flex gap-2 text-sm">
        <button
          disabled={busy}
          onClick={() => onAction("returned")}
          className="rounded-md border border-line px-3 py-1.5 font-medium text-ink hover:bg-paperDim disabled:opacity-50"
        >
          Returned
        </button>
        <button
          disabled={busy}
          onClick={() => onAction("kept")}
          className="rounded-md border border-line px-3 py-1.5 font-medium text-ink hover:bg-paperDim disabled:opacity-50"
        >
          Keeping it
        </button>
        <button
          disabled={busy}
          onClick={() => onAction("delete")}
          className="ml-auto rounded-md px-3 py-1.5 font-medium text-inkSoft hover:text-stamp disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
