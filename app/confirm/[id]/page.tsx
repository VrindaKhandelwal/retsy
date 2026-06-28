"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { getPurchase, confirmPurchase } from "@/lib/api";
import type { Purchase } from "@/lib/types";

function confidenceLabel(score: number) {
  if (score >= 0.75) return { label: "High confidence", color: "text-sage" };
  if (score >= 0.45) return { label: "Medium confidence", color: "text-mustard" };
  return { label: "Low confidence — please check this", color: "text-stamp" };
}

export default function ConfirmPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    retailer: "",
    item_name: "",
    order_number: "",
    return_deadline: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!params?.id || !token) {
      setLoadError("This link is missing information and can't be opened.");
      setLoading(false);
      return;
    }
    getPurchase(params.id, token).then(({ data, error }) => {
      if (error || !data) {
        setLoadError(
          "We couldn't find this purchase. The link may have expired or already been used."
        );
      } else {
        setPurchase(data.purchase);
        setForm({
          retailer: data.purchase.retailer,
          item_name: data.purchase.item_name,
          order_number: data.purchase.order_number || "",
          return_deadline: data.purchase.return_deadline,
        });
      }
      setLoading(false);
    });
  }, [params?.id, token]);

  async function handleConfirm() {
    if (!purchase) return;
    setSubmitting(true);
    setSubmitError("");
    const { data, error } = await confirmPurchase(purchase.id, token, {
      retailer: form.retailer,
      item_name: form.item_name,
      order_number: form.order_number,
      return_deadline: form.return_deadline,
    });
    setSubmitting(false);
    if (error || !data) {
      setSubmitError(error || "Something went wrong. Try again.");
      return;
    }
    setConfirmed(true);
  }

  if (loading) {
    return (
      <Centered>
        <p className="text-inkSoft">Loading…</p>
      </Centered>
    );
  }

  if (loadError) {
    return (
      <Centered>
        <p className="max-w-sm text-center text-stamp">{loadError}</p>
      </Centered>
    );
  }

  if (confirmed && purchase) {
    return (
      <Centered>
        <div className="max-w-sm text-center">
          <div className="font-display text-2xl font-semibold text-ink">
            You&apos;re all set
          </div>
          <p className="mt-3 text-inkSoft">
            We&apos;ll email you 7, 3, and 1 day before your return window for{" "}
            <strong>{form.item_name}</strong> closes on{" "}
            <strong>{formatDate(form.return_deadline)}</strong>.
          </p>
          <a
            href="/dashboard"
            className="mt-6 inline-block rounded-md bg-ink px-6 py-3 text-sm font-semibold text-paper hover:bg-ink/90"
          >
            Go to dashboard
          </a>
        </div>
      </Centered>
    );
  }

  if (!purchase) return null;

  const confidence = confidenceLabel(purchase.confidence);

  return (
    <main className="mx-auto min-h-screen max-w-lg px-6 py-12">
      <div className="text-sm font-semibold uppercase tracking-[0.15em] text-inkSoft">
        Retsy
      </div>

      <h1 className="mt-6 font-display text-2xl font-semibold text-ink">
        Is this right?
      </h1>
      <p className={`mt-2 text-sm font-medium ${confidence.color}`}>
        {confidence.label}
      </p>

      <div className="mt-6 rounded-lg border border-line bg-white">
        <div className="space-y-4 p-6">
          <Field
            label="Retailer"
            value={form.retailer}
            editing={editing}
            onChange={(v) => setForm((f) => ({ ...f, retailer: v }))}
          />
          <Field
            label="Item"
            value={form.item_name}
            editing={editing}
            onChange={(v) => setForm((f) => ({ ...f, item_name: v }))}
          />
          <Field
            label="Order number"
            value={form.order_number}
            editing={editing}
            placeholder="Not found"
            onChange={(v) => setForm((f) => ({ ...f, order_number: v }))}
          />
          <Field
            label="Return deadline"
            value={form.return_deadline}
            editing={editing}
            type="date"
            onChange={(v) => setForm((f) => ({ ...f, return_deadline: v }))}
          />
        </div>
        <div className="border-t border-line px-6 py-3">
          <button
            onClick={() => setEditing((e) => !e)}
            className="text-sm font-medium text-inkSoft underline decoration-line underline-offset-4 hover:text-ink"
          >
            {editing ? "Done editing" : "Edit details"}
          </button>
        </div>
      </div>

      {submitError && (
        <p className="mt-4 text-sm text-stamp">{submitError}</p>
      )}

      <button
        onClick={handleConfirm}
        disabled={submitting}
        className="mt-6 w-full rounded-md bg-ink px-6 py-3 text-base font-semibold text-paper transition hover:bg-ink/90 disabled:opacity-60"
      >
        {submitting ? "Confirming…" : "Confirm and set reminders"}
      </button>
    </main>
  );
}

function Field(props: {
  label: string;
  value: string;
  editing: boolean;
  type?: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const { label, value, editing, type = "text", placeholder, onChange } = props;
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-inkSoft">
        {label}
      </div>
      {editing ? (
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded-md border border-line px-3 py-2 text-base text-ink focus:border-ink focus:outline-none"
        />
      ) : (
        <div className="mt-1 font-mono text-base text-ink">
          {type === "date" ? formatDate(value) : value || "—"}
        </div>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      {children}
    </main>
  );
}

function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
