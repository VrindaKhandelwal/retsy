"use client";

// Dashboard — translated from the user's Claude Design export
// ("Return Tracker Dashboard.dc.html"): blush palette, Instrument Serif +
// Manrope, sidebar nav views, stat cards, sortable deadlines table.
// Wired to real data with the five-state model: Deciding(undecided) /
// To return / Returned / Kept / Missed (derived when the window closes).

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signup } from "@/lib/api";
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

type View = "dashboard" | "all" | "kept" | "returns";

function Dashboard({ email, token, gmailFlag }: { email: string; token: string; gmailFlag: string | null }) {
  const router = useRouter();
  const { purchases, gmailAccount, setGmailAccount, loadError, busyId, act, refresh } =
    useDashboardData(email, token);
  const [view, setView] = useState<View>("dashboard");
  const [sort, setSort] = useState<"date" | "cost">("date");
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
  const name = email.split("@")[0].replace(/[^a-zA-Z]/g, " ").trim().split(/\s+/)[0];
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const nav: { key: View; label: string; count: number }[] = [
    { key: "dashboard", label: "Dashboard", count: d.open.length },
    { key: "all", label: "All Purchases", count: d.all.length },
    { key: "kept", label: "Kept Purchases", count: d.kept.length },
    { key: "returns", label: "Returns", count: d.returnsView.length },
  ];

  const stats = [
    { label: "Tied up in returns", value: money(d.tiedUp), sub: `${d.open.length} item${d.open.length === 1 ? "" : "s"} still in window`, color: "#d94f7d", tint: "#fdeaf1" },
    { label: "Money saved", value: money(d.saved), sub: `${d.returned.length} return${d.returned.length === 1 ? "" : "s"} completed`, color: "#5fb897", tint: "#e8f4ee" },
    { label: "Closing this week", value: String(d.closingSoon), sub: "act within 7 days", color: "#ef8560", tint: "#fdeee7" },
    { label: "Next deadline", value: d.open.length ? `${d.open[0].days} days` : "—", sub: d.open.length ? d.open[0].p.item_name : "nothing pending", color: "#b79be0", tint: "#f2ecfb" },
  ];

  const listMeta: Record<Exclude<View, "dashboard">, { title: string; sub: string; rows: typeof d.all }> = {
    all: { title: "All Purchases", sub: `${d.all.length} purchases total`, rows: [...d.all].sort((a, b) => (b.p.created_at ?? "").localeCompare(a.p.created_at ?? "")) },
    kept: { title: "Kept Purchases", sub: "window missed or kept on purpose", rows: d.kept },
    returns: { title: "Returns", sub: `${d.returnsView.filter((x) => x.bucket === "to_return").length} to return · ${d.returned.length} completed`, rows: d.returnsView },
  };

  const headerSub =
    view === "dashboard"
      ? d.open.length
        ? `You have ${d.closingSoon} return${d.closingSoon === 1 ? "" : "s"} closing this week — let's not lose that money.`
        : "Nothing pending right now — nice work."
      : listMeta[view].sub;

  const sortedDeadlines = [...d.open].sort((a, b) =>
    sort === "cost" ? (priceOf(b.p) ?? 0) - (priceOf(a.p) ?? 0) : a.days - b.days
  );

  return (
    <div style={{ minHeight: "100vh", background: "#fbf1ef", fontFamily: SANS, color: "#2e2530", display: "grid", gridTemplateColumns: "240px 1fr" }}>
      <link rel="stylesheet" href={FONTS_URL} />

      {/* SIDEBAR */}
      <aside style={{ borderRight: "1px solid #f1e2e3", padding: "30px 22px", display: "flex", flexDirection: "column", gap: 28, position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 34, height: 34, borderRadius: 11, background: "linear-gradient(140deg, #e8749a, #d94f7d)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 16px rgba(217,79,125,0.32)" }}>
            <div style={{ width: 13, height: 13, border: "2.5px solid #fff", borderRadius: "50%", borderRightColor: "transparent" }} />
          </div>
          <span style={{ fontFamily: SERIF, fontSize: 24, letterSpacing: 0.2 }}>Retsy</span>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {nav.map((n) => {
            const activeNav = view === n.key;
            return (
              <div
                key={n.key}
                onClick={() => setView(n.key)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "11px 13px", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", color: activeNav ? "#2e2530" : "#7d7078", background: activeNav ? "#fdeef3" : "transparent" }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: activeNav ? "#d94f7d" : "#e2d3d6" }} />
                  {n.label}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: activeNav ? "#d94f7d" : "#c2b4b9" }}>{n.count}</span>
              </div>
            );
          })}
        </nav>

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <GmailConnect email={email} token={token} account={gmailAccount} onDisconnected={() => setGmailAccount(null)} />
          <div style={{ background: "#fff", border: "1px solid #f1e2e3", borderRadius: 16, padding: 15 }}>
            <div style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.25, marginBottom: 4 }}>Track anything.</div>
            <div style={{ fontSize: 12, color: "#9a8c92", lineHeight: 1.4 }}>
              Forward any order confirmation to <strong style={{ color: "#2e2530" }}>returns@retsy.xyz</strong> and we&apos;ll watch the window.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(140deg, #f7cdda, #e8749a)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#fff", fontSize: 13, flexShrink: 0 }}>
              {displayName.charAt(0)}
            </div>
            <div style={{ lineHeight: 1.2, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{displayName}</div>
              <div style={{ fontSize: 11, color: "#b0a2a7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{ padding: "34px 40px 48px", minWidth: 0 }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          {banner === "connected" && !syncing && (
            <div style={{ marginBottom: 18, background: "#e8f4ee", color: "#3d7d63", borderRadius: 14, padding: "12px 18px", fontSize: 13.5, fontWeight: 600 }}>
              Gmail connected — we&apos;re scanning your last 30 days of receipts now.
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
                ) : (
                  listMeta[view].title
                )}
              </h1>
              <p style={{ margin: "9px 0 0", fontSize: 15, color: "#7d7078" }}>{headerSub}</p>
            </div>
          </header>

          {/* STAT CARDS */}
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

          {purchases.length === 0 && (
            <div style={{ background: "#fff", border: "1px dashed #eec2d0", borderRadius: 22, padding: "36px 28px", textAlign: "center" }}>
              <div style={{ fontFamily: SERIF, fontSize: 22, marginBottom: 8 }}>Nothing tracked yet</div>
              <div style={{ fontSize: 14, color: "#7d7078", maxWidth: 460, margin: "0 auto" }}>
                Connect your Gmail from the sidebar for automatic tracking, or forward any order
                confirmation to <strong style={{ color: "#2e2530" }}>returns@retsy.xyz</strong>.
              </div>
            </div>
          )}

          {/* DASHBOARD VIEW: upcoming deadlines */}
          {view === "dashboard" && d.open.length > 0 && (
            <div style={{ background: "#fff", border: "1px solid #f1e2e3", borderRadius: 22, padding: "22px 24px", boxShadow: "0 10px 24px rgba(203,150,165,0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 24, margin: 0 }}>Upcoming deadlines</h2>
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
              <PurchaseTable rows={sortedDeadlines} busyId={busyId} act={act} showDelete={false} />
            </div>
          )}

          {/* LIST VIEWS */}
          {view !== "dashboard" && (
            <section style={{ background: "#fff", border: "1px solid #f1e2e3", borderRadius: 22, padding: "22px 24px", boxShadow: "0 10px 24px rgba(203,150,165,0.08)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 24, margin: 0 }}>{listMeta[view].title}</h2>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "#9a8c92" }}>{listMeta[view].sub}</span>
              </div>
              {listMeta[view].rows.length === 0 ? (
                <div style={{ padding: "28px 8px", textAlign: "center", fontSize: 13.5, color: "#b0a2a7" }}>Nothing here yet.</div>
              ) : (
                <PurchaseTable rows={listMeta[view].rows} busyId={busyId} act={act} showDelete />
              )}
            </section>
          )}
        </div>
      </main>
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

function PurchaseTable({
  rows,
  busyId,
  act,
  showDelete,
}: {
  rows: { p: Purchase; bucket: Bucket; days: number }[];
  busyId: string | null;
  act: (id: string, a: StatusAction) => void;
  showDelete: boolean;
}) {
  const grid = `minmax(110px,1.3fr) minmax(140px,1.9fr) minmax(64px,0.7fr) minmax(86px,0.8fr) minmax(140px,1fr)${showDelete ? " 28px" : ""}`;

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
            <select
              disabled={busy}
              value={SELECT_VALUE[bucket]}
              onChange={(e) => onSelect(p, e.target.value)}
              style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, border: "1px solid transparent", borderRadius: 10, padding: "6px 8px", cursor: "pointer", background: s.tint, color: s.color }}
            >
              <option value="undecided">Undecided</option>
              <option value="return">To Return</option>
              <option value="kept">Keep</option>
              <option value="returned">Return Complete</option>
            </select>
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
