"use client";

import { useState } from "react";
import { signup } from "@/lib/api";

export default function SignupForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
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
      <div className="rounded-lg border border-sage/40 bg-sage/10 px-5 py-4 text-sm text-ink">
        <span className="font-semibold">Check your inbox.</span> We sent a
        link to your dashboard — and the address to forward receipts to.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="flex-1">
        <label htmlFor="email" className="sr-only">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-line bg-white/70 px-4 py-3 text-base text-ink placeholder:text-inkSoft/60 focus:border-ink focus:outline-none"
        />
        {status === "error" && (
          <p className="mt-2 text-sm text-stamp">{errorMsg}</p>
        )}
      </div>
      <button
        type="submit"
        disabled={status === "loading"}
        className="rounded-md bg-ink px-6 py-3 text-base font-semibold text-paper transition hover:bg-ink/90 disabled:opacity-60"
      >
        {status === "loading" ? "Sending…" : "Get started"}
      </button>
    </form>
  );
}
