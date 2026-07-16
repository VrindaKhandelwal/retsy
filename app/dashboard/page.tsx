"use client";

// Dashboard — translated from the user's Claude Design export
// ("Return Tracker Dashboard.dc.html"): blush palette, Instrument Serif +
// Manrope, sidebar nav views, stat cards, sortable deadlines table.
// Wired to real data with the five-state model: Deciding(undecided) /
// To return / Returned / Kept / Missed (derived when the window closes).

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addPurchase, editPurchase, gmailConnectUrl, signup, type PurchaseEdits } from "@/lib/api";
import type { Purchase } from "@/lib/types";
import { bucketOf, daysUntil, formatDeadline, type Bucket } from "@/lib/purchaseGroups";
import { useDashboardData, type StatusAction } from "@/components/useDashboardData";
import GmailConnect from "@/components/GmailConnect";

const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700;800&display=swap";

const SERIF = "'Instrument Serif', Georgia, serif";
const SANS = "'Manrope', system-ui, sans-serif";

// Deadline color scale from the design.
function scale(daysLeft: number, bucket: Bucket) {
  if (bucket === "returned") return { color: "#5fb897", tint: "#e8f4ee" };
  if (bucket === "kept") return { color: "#9a8c92", tint: "#f1e9ea" };
  if (bucket === "missed") return { color: "#9a8c92", tint: "#f1e9ea" };
  if (daysLeft <= 2) return { color: "#d94f7d", tint: "#fdeaf1" };
  if (daysLeft <= 6) return { color: "#ef8560", tint: "#fdeee7" };
  if (daysLeft <= 13) return { color: "#d9a13f", tint: "#faf1de" };
  return { color: "#5fb897", tint: "#e8f4ee" };
}

function priceOf(p: Purchase): number | null {
  const m = p.order_total?.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  return m ? parseFloat(m[1].replace(/,/g, "")) : null;
}

function money(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#fbf1ef", color: "#9a8c92" }}>
          Loading…
        </main>
      }
    >
      <DashboardPageInner />
    </Suspense>
  );
}

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
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fbf1ef", fontFamily: SANS, color: "#2e2530", padding: 24 }}>
      <link rel="stylesheet" href={FONTS_URL} />
      <div style={{ width: "100%", maxWidth: 380 }}>
        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 40, margin: 0 }}>Retsy</h1>
        <p style={{ marginTop: 8, fontSize: 15, color: "#7d7078" }}>
          Enter your email and we&apos;ll send you a link to your dashboard.
        </p>
        {status === "done" ? (
          <div style={{ marginTop: 20, background: "#e8f4ee", color: "#3d7d63", borderRadius: 12, padding: "12px 16px", fontSize: 14 }}>
            Check your inbox for the link.
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              type="email"
              required
              placeholder="you@email.com"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              style={{ fontFamily: SANS, border: "1px solid #f1e2e3", background: "#fff", borderRadius: 12, padding: "12px 16px", fontSize: 15 }}
            />
            <button
              type="submit"
              disabled={status === "loading"}
              style={{ background: "linear-gradient(140deg, #e8749a, #d94f7d)", color: "#fff", fontSize: 14, fontWeight: 700, padding: "12px 20px", borderRadius: 13, border: "none", cursor: "pointer", boxShadow: "0 8px 20px rgba(217,79,125,0.3)", opacity: status === "loading" ? 0.6 : 1 }}
            >
              {status === "loading" ? "Sending…" : "Email me a link"}
            </button>
            {status === "error" && (
              <p style={{ fontSize: 13, color: "#d94f7d" }}>Couldn&apos;t send that — check the address and try again.</p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────

type View = "dashboard" | "all" | "kept" | "returns" | "analytics";

function Dashboard({ email, token, gmailFlag }: { email: string; token: string; gmailFlag: string | null }) {
  const router = useRouter();
  const { purchases, gmailAccount, setGmailAccount, fullName, loadError, busyId, act, refresh } =
    useDashboardData(email, token);
  const [view, setView] = useState<View>("dashboard");
  const [sort, setSort] = useState<"date" | "cost">("date");
  const [editor, setEditor] = useState<{ mode: "add" } | { mode: "edit"; p: Purchase } | null>(null);
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

  // While the inbox backfill is running, poll so purchases stream in live.
  const syncing = gmailAccount?.status === "active" && gmailAccount?.sync_backlog === true;
  useEffect(() => {
    if (!syncing) return;
    const id = setInterval(() => refresh({ poll: true }), 10_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncing]);

  const d = useMemo(() => {
    const all = purchases ?? [];
    const withBucket = all.map((p) => ({ p, bucket: bucketOf(p), days: daysUntil(p.return_deadline) }));
    const open = withBucket
      .filter((x) => x.bucket === "deciding" || x.bucket === "to_return")
      .sort((a, b) => a.days - b.days);
    const kept = withBucket.filter((x) => x.bucket === "kept" || x.bucket === "missed");
    const returned = withBucket.filter((x) => x.bucket === "returned");
    const returnsView = withBucket.filter((x) => x.bucket === "returned" || x.bucket === "to_return");

    const tiedUp = open.reduce((a, x) => a + (priceOf(x.p) ?? 0), 0);
    const saved = returned.reduce((a, x) => a + (priceOf(x.p) ?? 0), 0);
    const closingSoon = open.filter((x) => x.days <= 7).length;

    return { all: withBucket, open, kept, returned, returnsView, tiedUp, saved, closingSoon };
  }, [purchases]);

  if (loadError) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#fbf1ef", color: "#d94f7d", fontFamily: SANS }}>
        {loadError}
      </main>
    );
  }
  if (!purchases) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#fbf1ef", color: "#9a8c92", fontFamily: SANS }}>
        Loading…
      </main>
    );
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  // Real first name from the Google profile when Gmail is connected;
  // otherwise a best-effort guess from the email address.
  const emailGuess = email.split("@")[0].replace(/[^a-zA-Z]/g, " ").trim().split(/\s+/)[0];
  const firstName = fullName?.trim().split(/\s+/)[0] || emailGuess;
  const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const nav: { key: View; label: string; count: number | null }[] = [
    { key: "dashboard", label: "Dashboard", count: d.open.length },
    { key: "all", label: "All Purchases", count: d.all.length },
    { key: "kept", label: "Kept", count: d.kept.length },
    { key: "returns", label: "Returns", count: d.returnsView.length },
    { key: "analytics", label: "Analytics", count: null },
  ];

  const stats = [
    { label: "Tied up in returns", value: money(d.tiedUp), sub: `${d.open.length} item${d.open.length === 1 ? "" : "s"} still in window`, color: "#d94f7d", tint: "#fdeaf1" },
    { label: "Money saved", value: money(d.saved), sub: `${d.returned.length} return${d.returned.length === 1 ? "" : "s"} completed`, color: "#5fb897", tint: "#e8f4ee" },
    { label: "Closing this week", value: String(d.closingSoon), sub: "act within 7 days", color: "#ef8560", tint: "#fdeee7" },
    { label: "Next deadline", value: d.open.length ? `${d.open[0].days} days` : "—", sub: d.open.length ? d.open[0].p.item_name : "nothing pending", color: "#b79be0", tint: "#f2ecfb" },
  ];

  const listMeta: Record<Exclude<View, "dashboard" | "analytics">, { title: string; sub: string; rows: typeof d.all }> = {
    all: { title: "All Purchases", sub: `${d.all.length} purchases total`, rows: [...d.all].sort((a, b) => (b.p.created_at ?? "").localeCompare(a.p.created_at ?? "")) },
    kept: { title: "Kept", sub: "window missed or kept on purpose", rows: d.kept },
    returns: { title: "Returns", sub: `${d.returnsView.filter((x) => x.bucket === "to_return").length} to return · ${d.returned.length} completed`, rows: d.returnsView },
  };

  const headerSub =
    view === "dashboard"
      ? d.open.length
        ? `You have ${d.closingSoon} return${d.closingSoon === 1 ? "" : "s"} closing this week — let's not lose that money.`
        : "Nothing pending right now — nice work."
      : view === "analytics"
        ? "Your shopping habits, spending, and outcomes at a glance."
        : listMeta[view].sub;

  const sortedDeadlines = [...d.open].sort((a, b) =>
    sort === "cost" ? (priceOf(b.p) ?? 0) - (priceOf(a.p) ?? 0) : a.days - b.days
  );

  return (
    <div style={{ minHeight: "100vh", background: "#fbf1ef", fontFamily: SANS, color: "#2e2530" }}>
      <link rel="stylesheet" href={FONTS_URL} />

      {/* TOP BAR */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, padding: "20px 40px", borderBottom: "1px solid #f1e2e3", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 30, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(140deg, #e8749a, #d94f7d)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 16px rgba(217,79,125,0.32)", flexShrink: 0 }}>
              <div style={{ width: 13, height: 13, border: "2.5px solid #fff", borderRadius: "50%" }} />
            </div>
            <span style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: 0.2 }}>Retsy</span>
          </div>

          <nav style={{ display: "flex", alignItems: "center", gap: 26, flexWrap: "wrap" }}>
            {nav.map((n) => {
              const activeNav = view === n.key;
              return (
                <div
                  key={n.key}
                  onClick={() => setView(n.key)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 4px", fontSize: 15, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap", WebkitTextStroke: "0.3px currentColor", color: activeNav ? "#2e2530" : "#7d7078", background: activeNav ? "#fdeef3" : "transparent" }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: activeNav ? "#d94f7d" : "#e2d3d6", flexShrink: 0 }} />
                  {n.label}
                  {n.count !== null && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: activeNav ? "#d94f7d" : "#c2b4b9" }}>{n.count}</span>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <GmailConnect email={email} token={token} account={gmailAccount} onDisconnected={() => setGmailAccount(null)} />
          <div
            onClick={() => setEditor({ mode: "add" })}
            style={{ background: "#2e2530", color: "#fff", fontSize: 13, fontWeight: 700, padding: "10px 18px", borderRadius: 11, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
          >
            + Add purchase
          </div>
          <div title={`${fullName || displayName} · ${email}`} style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(140deg, #f7cdda, #e8749a)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#fff", fontSize: 13, flexShrink: 0 }}>
            {displayName.charAt(0)}
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main style={{ padding: "30px 24px 48px", minWidth: 0 }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          {banner === "connected" && !syncing && (
            <div style={{ marginBottom: 18, background: "#e8f4ee", color: "#3d7d63", borderRadius: 14, padding: "12px 18px", fontSize: 13.5, fontWeight: 600 }}>
              Gmail connected — we&apos;re scanning your last 2 months of receipts now.
            </div>
          )}
          {syncing && (
            <div style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 10, background: "#f2ecfb", color: "#7a5fb0", borderRadius: 14, padding: "12px 18px", fontSize: 13.5, fontWeight: 600 }}>
              <span style={{ width: 14, height: 14, flexShrink: 0, border: "2px solid #b79be0", borderRightColor: "transparent", borderRadius: "50%", animation: "spin 0.9s linear infinite" }} />
              Still scanning your inbox — purchases appear here as we find them. This page refreshes automatically.
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
          {banner === "error" && (
            <div style={{ marginBottom: 18, background: "#fdeaf1", color: "#d94f7d", borderRadius: 14, padding: "12px 18px", fontSize: 13.5, fontWeight: 600 }}>
              Couldn&apos;t connect Gmail — please try again.
            </div>
          )}

          {/* HEADER */}
          <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, marginBottom: 30 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#d94f7d", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 7 }}>{today}</div>
              <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 40, lineHeight: 1.05, margin: 0 }}>
                {view === "dashboard" ? (
                  <>
                    {greeting}, <span style={{ fontStyle: "italic" }}>{displayName}</span>
                  </>
                ) : view === "analytics" ? (
                  "Analytics"
                ) : (
                  listMeta[view].title
                )}
              </h1>
              <p style={{ margin: "9px 0 0", fontSize: 15, color: "#7d7078" }}>{headerSub}</p>
            </div>
          </header>

          {/* STAT CARDS */}
          {view !== "analytics" && (
          <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 18, marginBottom: 26 }}>
            {stats.map((s) => (
              <div key={s.label} style={{ background: "#fff", border: "1px solid #f1e2e3", borderRadius: 20, padding: 20, boxShadow: "0 10px 24px rgba(203,150,165,0.08)", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "#9a8c92" }}>{s.label}</span>
                  <span style={{ width: 30, height: 30, borderRadius: 9, background: s.tint, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color }} />
                  </span>
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.value}</div>
                <div style={{ fontSize: 12.5, color: "#a99ba0", marginTop: 7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.sub}</div>
              </div>
            ))}
          </section>
          )}

          {purchases.length === 0 && (
            <div style={{ background: "#fff", border: "1px solid #f1e2e3", borderRadius: 22, padding: "52px 28px", textAlign: "center", boxShadow: "0 10px 24px rgba(203,150,165,0.08)" }}>
              <div style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 1.1, marginBottom: 10 }}>
                Nothing tracked <span style={{ fontStyle: "italic", color: "#d94f7d" }}>yet</span>
              </div>
              <div style={{ fontSize: 15.5, fontWeight: 600, color: "#7d7078", maxWidth: 440, margin: "0 auto" }}>
                Connect your Gmail and we&apos;ll find your receipts automatically —
                every return window tracked from day one.
              </div>
              {gmailAccount?.status === "active" ? (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 9, marginTop: 26, background: "#e8f4ee", color: "#3d7d63", fontSize: 14.5, fontWeight: 700, padding: "13px 24px", borderRadius: 13 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#5fb897" }} />
                  Gmail connected — your receipts will appear after the next scan
                </div>
              ) : (
                <div
                  onClick={() => (window.location.href = gmailConnectUrl(email, token))}
                  style={{ display: "inline-block", marginTop: 26, background: "linear-gradient(140deg, #e8749a, #d94f7d)", color: "#fff", fontSize: 15.5, fontWeight: 800, padding: "15px 34px", borderRadius: 14, cursor: "pointer", boxShadow: "0 10px 26px rgba(217,79,125,0.35)" }}
                >
                  Connect Gmail
                </div>
              )}
              <div style={{ fontSize: 13, color: "#a99ba0", marginTop: 18 }}>
                Prefer not to link your inbox? Forward any order confirmation to{" "}
                <strong style={{ color: "#2e2530" }}>returns@retsy.xyz</strong> instead.
              </div>
            </div>
          )}

          {/* DASHBOARD VIEW: upcoming deadlines + purchases */}
          {view === "dashboard" && d.open.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <div style={{ background: "#fff", border: "1px solid #f1e2e3", borderRadius: 22, padding: "22px 24px", boxShadow: "0 10px 24px rgba(203,150,165,0.08)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                  <h2 style={{ fontFamily: "Verdana", fontWeight: 400, fontSize: 24, margin: 0 }}>Upcoming deadlines</h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#b0a2a7" }}>Sort by</span>
                    {(["date", "cost"] as const).map((k) => (
                      <div
                        key={k}
                        onClick={() => setSort(k)}
                        style={{ fontSize: 12.5, fontWeight: 700, padding: "7px 13px", borderRadius: 20, cursor: "pointer", color: sort === k ? "#fff" : "#7d7078", background: sort === k ? "#d94f7d" : "#f6ecec", textTransform: "capitalize" }}
                      >
                        {k}
                      </div>
                    ))}
                  </div>
                </div>
                <DeadlinesTable rows={sortedDeadlines} busyId={busyId} act={act} />
              </div>

              <div style={{ background: "#fff", border: "1px solid #f1e2e3", borderRadius: 22, padding: "22px 24px", boxShadow: "0 10px 24px rgba(203,150,165,0.08)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <h2 style={{ fontFamily: "Verdana", fontWeight: 400, fontSize: 24, margin: 0 }}>Purchases</h2>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "#9a8c92" }}>Awaiting decision · soonest first</span>
                </div>
                <PurchaseTable
                  rows={d.open}
                  busyId={busyId}
                  act={act}
                  showDelete
                  onEdit={(p) => setEditor({ mode: "edit", p })}
                />
                <p style={{ margin: "14px 8px 0", fontSize: 12, color: "#b0a2a7" }}>
                  Deadlines are estimates read from your emails and retailer policies —
                  occasionally we get one wrong. Click ✎ on any purchase to fix it.
                </p>
              </div>
            </div>
          )}

          {/* ANALYTICS VIEW */}
          {view === "analytics" && <AnalyticsView purchases={purchases} />}

          {/* LIST VIEWS */}
          {view !== "dashboard" && view !== "analytics" && (
            <section style={{ background: "#fff", border: "1px solid #f1e2e3", borderRadius: 22, padding: "22px 24px", boxShadow: "0 10px 24px rgba(203,150,165,0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 24, margin: 0 }}>{listMeta[view].title}</h2>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "#9a8c92" }}>{listMeta[view].sub}</span>
              </div>
              {listMeta[view].rows.length === 0 ? (
                <div style={{ padding: "28px 8px", textAlign: "center", fontSize: 13.5, color: "#b0a2a7" }}>Nothing here yet.</div>
              ) : (
                <PurchaseTable
                  rows={listMeta[view].rows}
                  busyId={busyId}
                  act={act}
                  showDelete
                  showRefund={view === "returns"}
                  onEdit={(p) => setEditor({ mode: "edit", p })}
                />
              )}
            </section>
          )}

          <p style={{ marginTop: 32, fontSize: 12.5, color: "#b0a2a7", textAlign: "center" }}>
            Track anything — forward any order confirmation to{" "}
            <strong style={{ color: "#2e2530" }}>returns@retsy.xyz</strong> and we&apos;ll watch the window.
          </p>
        </div>
      </main>

      {editor && (
        <PurchaseEditor
          editor={editor}
          onClose={() => setEditor(null)}
          onSave={async (fields) => {
            const result =
              editor.mode === "add"
                ? await addPurchase(email, token, {
                    item_name: fields.item_name!,
                    retailer: fields.retailer!,
                    return_deadline: fields.return_deadline!,
                    order_total: fields.order_total || undefined,
                  })
                : await editPurchase(email, token, editor.p.id, fields);
            if (!result.error) {
              await refresh({ poll: true });
              setEditor(null);
            }
            return result.error ?? null;
          }}
        />
      )}
    </div>
  );
}

// ── Add / edit modal ─────────────────────────────────────────────────────

function PurchaseEditor({
  editor,
  onClose,
  onSave,
}: {
  editor: { mode: "add" } | { mode: "edit"; p: Purchase };
  onClose: () => void;
  onSave: (fields: PurchaseEdits) => Promise<string | null>;
}) {
  const editing = editor.mode === "edit" ? editor.p : null;
  const [itemName, setItemName] = useState(editing?.item_name ?? "");
  const [retailer, setRetailer] = useState(editing?.retailer ?? "");
  const [deadline, setDeadline] = useState(editing?.return_deadline ?? "");
  const [total, setTotal] = useState(editing?.order_total ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const err = await onSave({
      item_name: itemName.trim(),
      retailer: retailer.trim(),
      return_deadline: deadline,
      order_total: total.trim(),
    });
    setSaving(false);
    if (err) setError(err);
  }

  const field = { display: "block", width: "100%", fontFamily: SANS, fontSize: 14, border: "1px solid #f1e2e3", borderRadius: 10, padding: "10px 12px", marginTop: 6, background: "#fff" } as const;
  const label = { fontSize: 12.5, fontWeight: 700, color: "#7d7078", display: "block", marginTop: 16 } as const;

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(46,37,48,0.35)", display: "grid", placeItems: "center", zIndex: 50, padding: 20 }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{ background: "#fbf1ef", borderRadius: 22, padding: "26px 26px 22px", width: "100%", maxWidth: 420, boxShadow: "0 24px 60px rgba(46,37,48,0.25)" }}
      >
        <div style={{ fontFamily: SERIF, fontSize: 24 }}>
          {editing ? "Edit purchase" : "Add a purchase"}
        </div>
        {editing ? (
          <div style={{ fontSize: 12.5, color: "#9a8c92", marginTop: 4 }}>
            Fix anything we read wrong — a new return date reschedules your reminders.
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: "#9a8c92", marginTop: 4 }}>
            For purchases we can&apos;t see — in-store buys, other inboxes.
          </div>
        )}

        <label style={label}>
          Item
          <input required value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Linen midi dress" style={field} />
        </label>
        <label style={label}>
          Retailer
          <input required value={retailer} onChange={(e) => setRetailer(e.target.value)} placeholder="Zara" style={field} />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={label}>
            Return by
            <input required type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={field} />
          </label>
          <label style={label}>
            Price <span style={{ fontWeight: 400, color: "#b0a2a7" }}>(optional)</span>
            <input value={total} onChange={(e) => setTotal(e.target.value)} placeholder="$45.99" style={field} />
          </label>
        </div>

        {error && <p style={{ fontSize: 13, color: "#d94f7d", marginTop: 12 }}>{error}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", fontFamily: SANS, fontSize: 14, fontWeight: 600, color: "#9a8c92", cursor: "pointer", padding: "11px 14px" }}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{ background: "linear-gradient(140deg, #e8749a, #d94f7d)", color: "#fff", border: "none", fontFamily: SANS, fontSize: 14, fontWeight: 700, padding: "11px 22px", borderRadius: 12, cursor: "pointer", boxShadow: "0 8px 20px rgba(217,79,125,0.3)", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Add purchase"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Purchase table (design's PurchaseTable, real data) ───────────────────

const SELECT_VALUE: Record<Bucket, string> = {
  deciding: "undecided",
  to_return: "return",
  returned: "returned",
  kept: "kept",
  missed: "undecided",
};

// ── Analytics ────────────────────────────────────────────────────────────
// All computed client-side from the purchases already loaded.

const PALETTE = ["#d94f7d", "#ef8560", "#d9a13f", "#5fb897", "#b79be0", "#e8749a"];

function AnalyticsView({ purchases }: { purchases: Purchase[] }) {
  const a = useMemo(() => {
    const dated = purchases.map((p) => ({
      p,
      price: priceOf(p),
      date: p.order_date || p.created_at?.slice(0, 10) || null,
      bucket: bucketOf(p),
    }));

    const totalSpent = dated.reduce((s, x) => s + (x.price ?? 0), 0);
    const priced = dated.filter((x) => x.price !== null);
    const avgOrder = priced.length ? totalSpent / priced.length : 0;
    const saved = dated.filter((x) => x.bucket === "returned").reduce((s, x) => s + (x.price ?? 0), 0);

    // Monthly spend, oldest → newest, only months that have data.
    const byMonth = new Map<string, number>();
    for (const x of dated) {
      if (!x.date || x.price === null) continue;
      byMonth.set(x.date.slice(0, 7), (byMonth.get(x.date.slice(0, 7)) ?? 0) + x.price);
    }
    const months = [...byMonth.entries()].sort((m, n) => m[0].localeCompare(n[0])).slice(-6)
      .map(([ym, total]) => ({
        label: new Date(ym + "-01T00:00:00").toLocaleDateString("en-US", { month: "short" }),
        total,
      }));

    // Retailers by spend (falling back to count when unpriced).
    const byRetailer = new Map<string, { spend: number; count: number }>();
    for (const x of dated) {
      const r = x.p.retailer || "Unknown";
      const cur = byRetailer.get(r) ?? { spend: 0, count: 0 };
      cur.spend += x.price ?? 0;
      cur.count += 1;
      byRetailer.set(r, cur);
    }
    const retailers = [...byRetailer.entries()]
      .sort((m, n) => n[1].spend - m[1].spend || n[1].count - m[1].count)
      .slice(0, 6)
      .map(([name, v]) => ({ name, ...v }));

    // Outcomes: how decisions actually land.
    const counts = { deciding: 0, to_return: 0, returned: 0, kept: 0, missed: 0 };
    for (const x of dated) counts[x.bucket]++;
    const resolved = counts.returned + counts.kept + counts.missed;
    const returnRate = resolved ? Math.round((counts.returned / resolved) * 100) : null;

    // Shopping days of the week.
    const weekdays = Array(7).fill(0) as number[];
    for (const x of dated) {
      if (x.date) weekdays[new Date(x.date + "T00:00:00").getDay()]++;
    }

    return { totalSpent, avgOrder, saved, count: purchases.length, months, retailers, counts, resolved, returnRate, weekdays };
  }, [purchases]);

  if (purchases.length === 0) {
    return (
      <div style={{ background: "#fff", border: "1px dashed #eec2d0", borderRadius: 22, padding: "36px 28px", textAlign: "center", color: "#7d7078", fontSize: 14 }}>
        Analytics appear once you have purchases tracked.
      </div>
    );
  }

  const card = { background: "#fff", border: "1px solid #f1e2e3", borderRadius: 22, padding: "22px 24px", boxShadow: "0 10px 24px rgba(203,150,165,0.08)", minWidth: 0 } as const;
  const h2 = { fontFamily: SERIF, fontWeight: 400, fontSize: 22, margin: "0 0 16px" } as const;
  const maxMonth = Math.max(...a.months.map((m) => m.total), 1);
  const maxRetailer = Math.max(...a.retailers.map((r) => r.spend), 1);
  const maxDay = Math.max(...a.weekdays, 1);
  const outcomeMeta: { key: keyof typeof a.counts; label: string; color: string }[] = [
    { key: "deciding", label: "Deciding", color: "#d9a13f" },
    { key: "to_return", label: "To return", color: "#ef8560" },
    { key: "returned", label: "Returned", color: "#5fb897" },
    { key: "kept", label: "Kept", color: "#9a8c92" },
    { key: "missed", label: "Missed", color: "#d94f7d" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* headline numbers */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 18 }}>
        {[
          { label: "Tracked spending", value: money(a.totalSpent), sub: `${a.count} purchases`, color: "#d94f7d", tint: "#fdeaf1" },
          { label: "Money back", value: money(a.saved), sub: `${a.counts.returned} returns completed`, color: "#5fb897", tint: "#e8f4ee" },
          { label: "Average order", value: money(a.avgOrder), sub: "across priced purchases", color: "#b79be0", tint: "#f2ecfb" },
          { label: "Return rate", value: a.returnRate !== null ? `${a.returnRate}%` : "—", sub: `of ${a.resolved} decided`, color: "#ef8560", tint: "#fdeee7" },
        ].map((s) => (
          <div key={s.label} style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "#9a8c92" }}>{s.label}</span>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: s.tint, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color }} />
              </span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 12.5, color: "#a99ba0", marginTop: 7 }}>{s.sub}</div>
          </div>
        ))}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* spending by month */}
        <div style={card}>
          <h2 style={h2}>Spending by month</h2>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 150, padding: "0 4px" }}>
            {a.months.map((m) => (
              <div key={m.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "#7d7078" }}>{money(m.total)}</div>
                <div style={{ width: "100%", maxWidth: 46, height: Math.max(6, (m.total / maxMonth) * 100), background: "linear-gradient(180deg, #e8749a, #d94f7d)", borderRadius: 8 }} />
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "#b0a2a7", textTransform: "uppercase" }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* top retailers */}
        <div style={card}>
          <h2 style={h2}>Top retailers</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {a.retailers.map((r, i) => (
              <div key={r.name}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  <span style={{ color: "#9a8c92", flexShrink: 0, marginLeft: 10 }}>
                    {r.spend > 0 ? money(r.spend) : ""} · {r.count} item{r.count === 1 ? "" : "s"}
                  </span>
                </div>
                <div style={{ height: 8, background: "#f6ecec", borderRadius: 6, overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(4, (r.spend / maxRetailer) * 100)}%`, height: "100%", background: PALETTE[i % PALETTE.length], borderRadius: 6 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* outcomes */}
        <div style={card}>
          <h2 style={h2}>Where purchases end up</h2>
          <div style={{ display: "flex", height: 14, borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
            {outcomeMeta.map((o) =>
              a.counts[o.key] > 0 ? (
                <div key={o.key} style={{ flex: a.counts[o.key], background: o.color }} />
              ) : null
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 18px" }}>
            {outcomeMeta.map((o) => (
              <span key={o.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#7d7078" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: o.color }} />
                {o.label} · {a.counts[o.key]}
              </span>
            ))}
          </div>
        </div>

        {/* shopping days */}
        <div style={card}>
          <h2 style={h2}>Shopping days</h2>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 120, padding: "0 4px" }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
              <div key={d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#7d7078" }}>{a.weekdays[i] || ""}</div>
                <div style={{ width: "100%", maxWidth: 34, height: Math.max(4, (a.weekdays[i] / maxDay) * 80), background: a.weekdays[i] === maxDay ? "#d94f7d" : "#f0cdd9", borderRadius: 7 }} />
                <div style={{ fontSize: 11, fontWeight: 700, color: "#b0a2a7" }}>{d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Compact closing-soon table from the design: colored retailer, tight
// columns, status select — no edit/delete (the Purchases panel has those).
function DeadlinesTable({
  rows,
  busyId,
  act,
}: {
  rows: { p: Purchase; bucket: Bucket; days: number }[];
  busyId: string | null;
  act: (id: string, a: StatusAction) => void;
}) {
  const grid = "minmax(110px,1.3fr) minmax(110px,1.6fr) minmax(64px,0.7fr) minmax(76px,0.7fr) minmax(128px,1fr)";

  function onSelect(p: Purchase, value: string) {
    if (value === "undecided") act(p.id, "undecided");
    else if (value === "return") act(p.id, "to_return");
    else if (value === "kept") act(p.id, "kept");
    else if (value === "returned") act(p.id, "returned");
  }

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: grid, gap: 8, minWidth: 500, padding: "0 8px 10px", fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#b0a2a7" }}>
        <div>Retailer</div>
        <div>Item</div>
        <div>Price</div>
        <div>Days left</div>
        <div>Action</div>
      </div>
      {rows.map(({ p, bucket, days }) => {
        const s = scale(days, bucket);
        return (
          <div key={p.id} style={{ display: "grid", gridTemplateColumns: grid, gap: 8, minWidth: 500, alignItems: "center", padding: "12px 8px", borderTop: "1px solid #f6ecec", opacity: busyId === p.id ? 0.5 : 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 7, background: s.tint, color: s.color, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800 }}>
                {(p.retailer || "?").charAt(0).toUpperCase()}
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: s.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.retailer}</span>
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={p.item_name}>
              {p.item_name}
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{p.order_total || "—"}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{days}d</span>
            </div>
            <select
              disabled={busyId === p.id}
              value={SELECT_VALUE[bucket]}
              onChange={(e) => onSelect(p, e.target.value)}
              style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, border: "1px solid transparent", borderRadius: 10, padding: "6px 8px", cursor: "pointer", background: s.tint, color: s.color }}
            >
              <option value="undecided">Undecided</option>
              <option value="return">To Return</option>
              <option value="kept">Keep</option>
              <option value="returned">Return Complete</option>
            </select>
          </div>
        );
      })}
    </div>
  );
}

function RefundPill({ p }: { p: Purchase }) {
  if (p.refund_status === "received") {
    return (
      <span style={{ display: "inline-block", background: "#e8f4ee", color: "#5fb897", fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>
        Refund received{p.refund_amount ? ` · ${p.refund_amount}` : ""}
      </span>
    );
  }
  if (p.refund_status === "pending") {
    return (
      <span style={{ display: "inline-block", background: "#faf1de", color: "#d9a13f", fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>
        Refund pending
      </span>
    );
  }
  return <span style={{ color: "#d9c4ca", fontSize: 13 }}>—</span>;
}

function PurchaseTable({
  rows,
  busyId,
  act,
  showDelete,
  showRefund = false,
  onEdit,
}: {
  rows: { p: Purchase; bucket: Bucket; days: number }[];
  busyId: string | null;
  act: (id: string, a: StatusAction) => void;
  showDelete: boolean;
  showRefund?: boolean;
  onEdit: (p: Purchase) => void;
}) {
  const grid = `minmax(110px,1.3fr) minmax(140px,1.9fr) minmax(64px,0.7fr) minmax(86px,0.8fr)${showRefund ? " minmax(130px,1fr)" : ""} minmax(140px,1fr)${showDelete ? " 28px" : ""}`;

  function onSelect(p: Purchase, value: string) {
    if (value === "undecided") act(p.id, "undecided");
    else if (value === "return") act(p.id, "to_return");
    else if (value === "returned") act(p.id, "returned");
    else if (value === "kept") act(p.id, "kept");
  }

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: grid, gap: 8, minWidth: 560, padding: "0 8px 10px", fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#b0a2a7" }}>
        <div>Retailer</div>
        <div>Item</div>
        <div>Price</div>
        <div>Days left</div>
        {showRefund && <div>Refund</div>}
        <div>Action</div>
        {showDelete && <div />}
      </div>
      {rows.map(({ p, bucket, days }) => {
        const s = scale(days, bucket);
        const daysText =
          bucket === "returned" ? "Returned" :
          bucket === "kept" ? "Kept" :
          bucket === "missed" ? "Missed" :
          `${days}d left`;
        const busy = busyId === p.id;
        return (
          <div key={p.id} style={{ display: "grid", gridTemplateColumns: grid, gap: 8, minWidth: 560, alignItems: "center", padding: "12px 8px", borderTop: "1px solid #f6ecec", opacity: busy ? 0.5 : 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 7, background: s.tint, color: s.color, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800 }}>
                {(p.retailer || "?").charAt(0).toUpperCase()}
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.retailer}</span>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={p.item_name}>
                {p.item_name}
              </div>
              <div style={{ fontSize: 11, color: "#b0a2a7", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {p.delivery_date
                  ? `delivered ${formatDeadline(p.delivery_date)}`
                  : p.order_date
                    ? `ordered ${formatDeadline(p.order_date)}`
                    : ""}
                {" · by "}
                {formatDeadline(p.return_deadline)}
              </div>
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{p.order_total || "—"}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: s.color, whiteSpace: "nowrap" }}>{daysText}</span>
            </div>
            {showRefund && (
              <div>
                <RefundPill p={p} />
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
              <select
                disabled={busy}
                value={SELECT_VALUE[bucket]}
                onChange={(e) => onSelect(p, e.target.value)}
                style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, border: "1px solid transparent", borderRadius: 10, padding: "6px 8px", cursor: "pointer", background: s.tint, color: s.color, minWidth: 0 }}
              >
                <option value="undecided">Undecided</option>
                <option value="return">To Return</option>
                <option value="kept">Keep</option>
                <option value="returned">Return Complete</option>
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={() => onEdit(p)}
                title="Edit purchase"
                style={{ border: "none", background: "transparent", color: "#c2b4b9", cursor: "pointer", fontSize: 14, padding: 0, flexShrink: 0 }}
              >
                ✎
              </button>
            </div>
            {showDelete && (
              <button
                disabled={busy}
                onClick={() => act(p.id, "delete")}
                title="Delete"
                style={{ border: "none", background: "transparent", color: "#d9c4ca", cursor: "pointer", fontSize: 15, padding: 0 }}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
