// Landing page — translated from the user's Claude Design export
// ("Landing Page.dc.html"): blush palette, Instrument Serif + Manrope,
// hero with email capture, three-step how-it-works.

import SignupForm from "@/components/SignupForm";

const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700;800&display=swap";

const SERIF = "'Instrument Serif', Georgia, serif";
const SANS = "'Manrope', system-ui, sans-serif";

const STEPS = [
  {
    number: "1",
    title: "Sign up and connect your inbox",
    body: "Link your Gmail and Retsy automatically picks up your order confirmations — or forward receipts to returns@retsy.xyz. Nothing to log by hand.",
    color: "#d94f7d",
    tint: "#fdeaf1",
  },
  {
    number: "2",
    title: "We track the window",
    body: "Retsy watches the return deadline and counts down the days left, so you always know where you stand.",
    color: "#d9a13f",
    tint: "#faf1de",
  },
  {
    number: "3",
    title: "Decide before it closes",
    body: "Keep it, return it, or mark it undecided — get nudged before the window closes so nothing slips through.",
    color: "#5fb897",
    tint: "#e8f4ee",
  },
];

export default function LandingPage() {
  return (
    <div style={{ background: "#fbf1ef", fontFamily: SANS, color: "#2e2530", minHeight: "100vh" }}>
      <link rel="stylesheet" href={FONTS_URL} />

      {/* NAV */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "26px 48px", maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(140deg, #e8749a, #d94f7d)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 16px rgba(217,79,125,0.32)", flexShrink: 0 }}>
            <div style={{ width: 12, height: 12, border: "2.5px solid #fff", borderRadius: "50%", borderRightColor: "transparent" }} />
          </div>
          <span style={{ fontFamily: SERIF, fontSize: 22 }}>Retsy</span>
        </div>
      </header>

      {/* HERO */}
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "60px 24px 40px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#fdeaf1", color: "#d94f7d", fontSize: 12.5, fontWeight: 700, padding: "8px 16px", borderRadius: 20, marginBottom: 22 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#d94f7d" }} />
          Never miss a return window again
        </div>

        <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 56, lineHeight: 1.08, margin: "0 0 18px", maxWidth: 640 }}>
          Every return, tracked.{" "}
          <span style={{ fontStyle: "italic", color: "#d94f7d" }}>Every deadline</span>, handled.
        </h1>

        <p style={{ fontSize: 17, color: "#7d7078", lineHeight: 1.55, maxWidth: 480, margin: "0 0 34px" }}>
          Retsy watches every purchase&apos;s return window so you don&apos;t have to — and
          shows you exactly how many days you have left to send it back.
        </p>

        <SignupForm />
      </section>

      {/* HOW IT WORKS */}
      <section style={{ maxWidth: 1040, margin: "30px auto 0", padding: "50px 24px 90px" }}>
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#d94f7d", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            How it works
          </div>
          <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 34, margin: 0 }}>
            Three steps between you and your money
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 22 }}>
          {STEPS.map((s) => (
            <div key={s.number} style={{ background: "#fff", border: "1px solid #f1e2e3", borderRadius: 22, padding: "28px 24px", boxShadow: "0 10px 24px rgba(203,150,165,0.08)", minWidth: 0 }}>
              <div style={{ width: 42, height: 42, borderRadius: 13, background: s.tint, color: s.color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SERIF, fontSize: 20, marginBottom: 20 }}>
                {s.number}
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 9 }}>{s.title}</div>
              <div style={{ fontSize: 14, color: "#a99ba0", lineHeight: 1.55 }}>{s.body}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
