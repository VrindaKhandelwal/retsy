"use client";

import { useState } from "react";
import { signup } from "@/lib/api";

const SANS = "'Manrope', system-ui, sans-serif";

// Email-capture pill from the Landing Page design export, wired to the
// real signup function (which emails the user their dashboard link).
export default function SignupForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    const { error } = await signup(email);
    if (error) {
      setErrorMsg(error);
      setStatus("error");
      return;
    }
    setStatus("done");
  }

  if (status === "done") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #eafaf0", borderRadius: 16, padding: "16px 22px", boxShadow: "0 14px 30px rgba(203,150,165,0.14)", width: "100%", maxWidth: 440, textAlign: "left" }}>
        <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#e8f4ee", color: "#5fb897", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
          ✓
        </span>
        <span style={{ fontSize: 14.5, fontWeight: 600 }}>
          Check your inbox — we sent your dashboard link to {email}.
        </span>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", maxWidth: 440 }}>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #f1e2e3", borderRadius: 16, padding: 8, boxShadow: "0 14px 30px rgba(203,150,165,0.14)", width: "100%" }}
      >
        <label htmlFor="email" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", fontFamily: SANS, fontSize: 15, padding: "10px 12px", color: "#2e2530", outline: "none" }}
        />
        <button
          type="submit"
          disabled={status === "loading"}
          style={{ flexShrink: 0, border: "none", background: "linear-gradient(140deg, #e8749a, #d94f7d)", color: "#fff", fontFamily: SANS, fontSize: 14, fontWeight: 700, padding: "12px 22px", borderRadius: 11, cursor: "pointer", boxShadow: "0 8px 20px rgba(217,79,125,0.3)", opacity: status === "loading" ? 0.6 : 1 }}
        >
          {status === "loading" ? "Sending…" : "Get early access"}
        </button>
      </form>
      {status === "error" && (
        <p style={{ marginTop: 10, fontSize: 13, color: "#d94f7d", textAlign: "left" }}>{errorMsg}</p>
      )}
    </div>
  );
}
