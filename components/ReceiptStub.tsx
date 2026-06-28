export default function ReceiptStub() {
  return (
    <div className="relative mx-auto w-full max-w-sm rotate-[1.5deg]">
      <div className="rounded-sm bg-white shadow-[0_18px_40px_-12px_rgba(33,29,24,0.35)]">
        <div className="px-7 pb-7 pt-6 font-mono text-[13px] leading-relaxed text-ink">
          <div className="text-center font-display text-base font-semibold tracking-wide">
            ZARA — ORDER #88213
          </div>
          <div className="mt-1 text-center text-[11px] text-inkSoft">
            May 14, 2026 · Forwarded to Retsy
          </div>

          <div className="my-4 border-t border-dashed border-line" />

          <div className="flex justify-between">
            <span>1× Wool Coat, Camel, M</span>
            <span>$148.00</span>
          </div>
          <div className="mt-1 flex justify-between text-inkSoft">
            <span>Shipping</span>
            <span>$0.00</span>
          </div>

          <div className="my-4 border-t border-dashed border-line" />

          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span>$148.00</span>
          </div>

          <div className="mt-5 flex items-center justify-between rounded-sm bg-paperDim px-3 py-2 text-[11px] text-inkSoft">
            <span>Retailer detected</span>
            <span className="font-semibold text-ink">Zara · 30-day window</span>
          </div>
        </div>

        <div className="relative px-7 pb-6">
          <div
            className="-rotate-6 inline-block rounded-sm border-2 border-stamp px-3 py-1.5 font-display text-sm font-bold uppercase tracking-wider text-stamp"
            style={{ mixBlendMode: "multiply" }}
          >
            Return by Jun 13
          </div>
        </div>

        <div className="h-3 w-full perf-edge" />
      </div>

      {/* Perforated tear-off shadow stub behind */}
      <div className="absolute inset-x-3 -bottom-2 -z-10 h-6 rounded-sm bg-paperDim/70" />
    </div>
  );
}
