"use client";

// Dashboard — adapted from the user's RetsyDashboard.jsx concept (warm stone
// palette, table layout, decision dropdown) and wired to real data with the
// five-state model: Deciding / To return / Returned / Kept / Missed(derived).

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  BadgeDollarSign,
  CheckCircle2,
  ChevronDown,
  Clock,
  Mail,
  PackageCheck,
  Store,
  X,
  XCircle,
} from "lucide-react";
import { signup } from "@/lib/api";
import type { Purchase } from "@/lib/types";
import { bucketOf, daysUntil, dollarsAtStake, formatDeadline } from "@/lib/purchaseGroups";
import { useDashboardData, type StatusAction } from "@/components/useDashboardData";
import GmailConnect from "@/components/GmailConnect";

function DashboardPageInner() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const token = searchParams.get("token") || "";
  const gmailFlag = searchParams.get("gmail");

  if (!email || !token) {
    return <RequestLinkScreen />;
  }

  return <Dashboard email={email} token={token} gmailFlag={gmailFlag} />;
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-stone-50 px-6">
          <p className="text-stone-400">Loading…</p>
        </main>
      }
    >
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
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-3xl tracking-tight text-stone-900">Retsy</h1>
        <p className="mt-2 text-sm text-stone-500">
          Enter your email and we&apos;ll send you a link to your dashboard.
        </p>
        {status === "done" ? (
          <div className="mt-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">
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
              className="w-full rounded-lg border border-stone-200 bg-white px-4 py-3 text-base focus:border-stone-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="rounded-lg bg-stone-900 px-6 py-3 text-base font-semibold text-white hover:bg-stone-700 disabled:opacity-60"
            >
              {status === "loading" ? "Sending…" : "Email me a link"}
            </button>
            {status === "error" && (
              <p className="text-sm text-red-600">
                Couldn&apos;t send that — check the address and try again.
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}

// ── Decision dropdown (from RetsyDashboard.jsx) ─────────────────────────

type Decision = "undecided" | "return" | "keep";

const decisionMeta: Record<Decision, { label: string; dot: string; text: string }> = {
  undecided: { label: "Decide…", dot: "bg-stone-300", text: "text-stone-500" },
  return: { label: "Return", dot: "bg-red-500", text: "text-red-700" },
  keep: { label: "Keep", dot: "bg-emerald-500", text: "text-emerald-700" },
};

function DecisionSelect({
  value,
  disabled,
  onChange,
}: {
  value: Decision;
  disabled: boolean;
  onChange: (d: Decision) => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = decisionMeta[value];
  const options: Decision[] = ["undecided", "return", "keep"];

  return (
    <div className="relative inline-block text-left">
      <button
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium transition-colors hover:border-stone-300 disabled:opacity-50 ${meta.text}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
        {meta.label}
        <ChevronDown size={14} className="text-stone-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1.5 w-40 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-lg">
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${decisionMeta[opt].dot}`} />
                {decisionMeta[opt].label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Urgency + outcome styling (from RetsyDashboard.jsx) ─────────────────

function urgency(days: number) {
  if (days <= 3) return "critical";
  if (days <= 10) return "soon";
  return "fine";
}

const urgencyStyles: Record<string, string> = {
  critical: "bg-red-50 text-red-700 ring-1 ring-red-200",
  soon: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  fine: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
};

const resolvedTagMeta = {
  returned: { label: "Returned", icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  kept: { label: "Kept", icon: PackageCheck, cls: "bg-stone-100 text-stone-500 ring-1 ring-stone-200" },
  missed: { label: "Missed", icon: XCircle, cls: "bg-red-50 text-red-700 ring-1 ring-red-200" },
} as const;

// ── Dashboard ────────────────────────────────────────────────────────────

function Dashboard({
  email,
  token,
  gmailFlag,
}: {
  email: string;
  token: string;
  gmailFlag: string | null;
}) {
  const router = useRouter();
  const { purchases, gmailAccount, setGmailAccount, loadError, busyId, act } =
    useDashboardData(email, token);
  const [banner, setBanner] = useState<"connected" | "error" | null>(
    gmailFlag === "connected" || gmailFlag === "error" ? gmailFlag : null
  );

  useEffect(() => {
    if (gmailFlag) {
      router.replace(
        `/dashboard?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`,
        { scroll: false }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { active, resolved, criticalCount, totalSaved } = useMemo(() => {
    const active: Purchase[] = [];
    const resolved: { p: Purchase; outcome: keyof typeof resolvedTagMeta }[] = [];
    let criticalCount = 0;

    for (const p of purchases ?? []) {
      const bucket = bucketOf(p);
      if (bucket === "deciding" || bucket === "to_return") {
        active.push(p);
        if (urgency(daysUntil(p.return_deadline)) === "critical") criticalCount++;
      } else {
        resolved.push({ p, outcome: bucket as keyof typeof resolvedTagMeta });
      }
    }
    active.sort((a, b) => a.return_deadline.localeCompare(b.return_deadline));
    const totalSaved = dollarsAtStake(
      resolved.filter((r) => r.outcome === "returned").map((r) => r.p)
    );
    return { active, resolved, criticalCount, totalSaved };
  }, [purchases]);

  if (loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 px-6">
        <p className="max-w-sm text-center text-red-600">{loadError}</p>
      </main>
    );
  }

  if (!purchases) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 px-6">
        <p className="text-stone-400">Loading…</p>
      </main>
    );
  }

  const decisionOf = (p: Purchase): Decision =>
    p.status === "to_return" ? "return" : "undecided";

  const actForDecision = (id: string, d: Decision) => {
    if (d === "return") act(id, "to_return");
    else if (d === "keep") act(id, "kept");
    else act(id, "undecided");
  };

  return (
    <div className="min-h-screen bg-stone-50 px-6 py-10 font-sans text-stone-900">
      <div className="mx-auto max-w-4xl">
        {/* header */}
        <div className="mb-6 flex items-end justify-between border-b border-stone-200 pb-6">
          <div>
            <h1 className="font-serif text-3xl tracking-tight text-stone-900">Retsy</h1>
            <p className="mt-1 text-sm text-stone-500">Track before the window closes</p>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-2">
              <p className="text-sm text-stone-500">
                <span className="font-mono text-base font-medium text-stone-900">{active.length}</span> open
              </p>
              {totalSaved !== null && totalSaved > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                  <BadgeDollarSign size={11} />
                  <span className="font-mono">${totalSaved.toFixed(2)}</span> saved
                </span>
              )}
            </div>
            {criticalCount > 0 && (
              <p className="mt-0.5 flex items-center justify-end gap-1 text-xs font-medium text-red-600">
                <AlertTriangle size={12} />
                {criticalCount} closing within 3 days
              </p>
            )}
            <p className="mt-0.5 text-xs text-stone-400">{email}</p>
          </div>
        </div>

        {banner === "connected" && (
          <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
            Gmail connected. We&apos;re scanning your last 30 days of receipts now —
            refresh in a minute to see them. After this, we check once a day.
          </div>
        )}
        {banner === "error" && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            Couldn&apos;t connect Gmail — please try again.
          </div>
        )}

        <GmailConnect
          email={email}
          token={token}
          account={gmailAccount}
          onDisconnected={() => setGmailAccount(null)}
        />

        {/* empty state: the two ways in */}
        {purchases.length === 0 && (
          <div className="mt-6 rounded-xl border border-dashed border-stone-300 bg-white px-6 py-8">
            <p className="text-center font-medium text-stone-700">
              Nothing tracked yet — two ways to get started:
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-stone-200 px-4 py-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-stone-800">
                  <Mail size={14} /> Connect your Gmail
                </div>
                <p className="mt-1 text-sm text-stone-500">
                  Automatic — we check your inbox once a day and track new receipts. Read-only.
                </p>
              </div>
              <div className="rounded-lg border border-stone-200 px-4 py-4">
                <div className="text-sm font-semibold text-stone-800">Forward receipts manually</div>
                <p className="mt-1 text-sm text-stone-500">
                  Works with any inbox — forward order confirmations to{" "}
                  <strong className="text-stone-800">returns@retsy.xyz</strong>.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* active table */}
        {purchases.length > 0 && (
          <div className="mt-6 overflow-hidden rounded-xl border border-stone-200 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/80 text-left text-xs font-medium uppercase tracking-wide text-stone-400">
                  <th className="px-5 py-3">Item</th>
                  <th className="hidden px-5 py-3 text-right sm:table-cell">Price</th>
                  <th className="px-5 py-3">Days to return</th>
                  <th className="px-5 py-3">Decision</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {active.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-sm text-stone-400">
                      Nothing open right now.
                    </td>
                  </tr>
                )}
                {active.map((p) => {
                  const left = daysUntil(p.return_deadline);
                  return (
                    <tr key={p.id} className="border-b border-stone-100 last:border-b-0 hover:bg-stone-50/60">
                      <td className="max-w-[16rem] px-5 py-4">
                        <div className="truncate font-medium text-stone-800" title={p.item_name}>
                          {p.item_name}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-stone-400">
                          <Store size={12} />
                          {p.retailer}
                          {p.delivery_date
                            ? ` · delivered ${formatDeadline(p.delivery_date)}`
                            : p.order_date
                              ? ` · ordered ${formatDeadline(p.order_date)}`
                              : ""}
                        </div>
                      </td>
                      <td className="hidden px-5 py-4 text-right font-mono text-stone-800 sm:table-cell">
                        {p.order_total || "—"}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-xs font-medium ${urgencyStyles[urgency(left)]}`}
                        >
                          <Clock size={11} />
                          {left}d left
                        </span>
                        <div className="mt-1 text-[10px] text-stone-400">
                          by {formatDeadline(p.return_deadline)}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <DecisionSelect
                          value={decisionOf(p)}
                          disabled={busyId === p.id}
                          onChange={(d) => actForDecision(p.id, d)}
                        />
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {p.status === "to_return" ? (
                            <button
                              disabled={busyId === p.id}
                              onClick={() => act(p.id, "returned")}
                              className="whitespace-nowrap rounded-full bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-700 ring-1 ring-sky-200 transition-colors hover:bg-sky-100 disabled:opacity-50"
                            >
                              Mark returned
                            </button>
                          ) : (
                            <span className="text-xs text-stone-300">—</span>
                          )}
                          <button
                            disabled={busyId === p.id}
                            onClick={() => act(p.id, "delete")}
                            title="Delete"
                            className="text-stone-300 hover:text-red-500 disabled:opacity-50"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* resolved */}
        {resolved.length > 0 && (
          <div className="mt-10">
            <h2 className="mb-3 font-serif text-lg text-stone-700">Resolved</h2>
            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {resolved.map(({ p, outcome }) => {
                    const tag = resolvedTagMeta[outcome];
                    const Icon = tag.icon;
                    return (
                      <tr key={p.id} className="border-b border-stone-100 last:border-b-0">
                        <td className="max-w-[18rem] px-5 py-3.5">
                          <div className="truncate font-medium text-stone-700" title={p.item_name}>
                            {p.item_name}
                          </div>
                          <div className="text-xs text-stone-400">{p.retailer}</div>
                        </td>
                        <td className="hidden px-5 py-3.5 text-right font-mono text-stone-500 sm:table-cell">
                          {p.order_total || ""}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tag.cls}`}>
                            <Icon size={11} />
                            {tag.label}
                          </span>
                        </td>
                        <td className="w-24 px-5 py-3.5 text-right">
                          {outcome === "missed" ? (
                            <button
                              disabled={busyId === p.id}
                              onClick={() => act(p.id, "returned")}
                              className="text-xs font-medium text-stone-400 hover:text-emerald-600"
                              title="Returned it anyway"
                            >
                              Returned it
                            </button>
                          ) : (
                            <button
                              disabled={busyId === p.id}
                              onClick={() => act(p.id, "undecided")}
                              className="text-xs font-medium text-stone-300 hover:text-stone-600"
                            >
                              Undo
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {purchases.length > 0 && (
          <p className="mt-4 text-xs text-stone-400">
            Undecided or &quot;Return&quot; items move to Resolved automatically once the
            window closes, tagged Missed. Mark an item returned before then to close it out.
          </p>
        )}
      </div>
    </div>
  );
}
