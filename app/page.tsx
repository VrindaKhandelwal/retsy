import SignupForm from "@/components/SignupForm";
import ReceiptStub from "@/components/ReceiptStub";

const STEPS = [
  {
    label: "Forward",
    copy: "Forward any order confirmation or receipt to returns@retsy.xyz.",
  },
  {
    label: "Confirm",
    copy: "We read it, guess the retailer and deadline, and ask you to double-check.",
  },
  {
    label: "Remind",
    copy: "We email you 7, 3, and 1 day before the window closes.",
  },
];

export default function LandingPage() {
  return (
    <main>
      <div className="mx-auto max-w-6xl px-6 pb-10 pt-8">
        <div className="text-sm font-semibold uppercase tracking-[0.15em] text-inkSoft">
          Retsy
        </div>
      </div>

      <section className="mx-auto grid max-w-6xl gap-14 px-6 pb-20 pt-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl">
            Never miss a return
            <br />
            window again.
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-inkSoft">
            Forward your receipts. We&apos;ll remind you before it&apos;s too
            late.
          </p>

          <div className="mt-8 max-w-lg">
            <SignupForm />
          </div>

          <p className="mt-4 text-sm text-inkSoft">
            No app to install. No account to set up. Just an email address to
            forward to.
          </p>
        </div>

        <ReceiptStub />
      </section>

      <section className="border-t border-line bg-paperDim/50">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="font-display text-2xl font-semibold text-ink">
            How it works
          </h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.label} className="relative">
                <div className="font-mono text-xs text-stamp">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="mt-2 font-display text-lg font-semibold text-ink">
                  {step.label}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-inkSoft">
                  {step.copy}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-10 text-sm text-inkSoft">
        Retsy — returns@retsy.xyz
      </footer>
    </main>
  );
}
