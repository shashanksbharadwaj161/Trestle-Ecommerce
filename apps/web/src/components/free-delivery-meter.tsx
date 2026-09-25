import { SHIPPING_METHODS } from "@trestle/shared";
import { cn } from "@/lib/cn";
import { usd } from "@/lib/format";

const FREE_OVER_MICROS = BigInt(SHIPPING_METHODS.standard.freeOverCents) * 10_000n;

/** "Spend $X more" with a meter that fills toward the free-standard-delivery threshold. */
export function FreeDeliveryMeter({
  subtotalMicros,
  className,
}: {
  subtotalMicros: bigint;
  className?: string;
}) {
  const remaining = FREE_OVER_MICROS - subtotalMicros;
  const pct = Math.min(100, Number((subtotalMicros * 100n) / FREE_OVER_MICROS));
  const done = remaining <= 0n;
  return (
    <div className={className}>
      <p className="text-[0.8125rem] text-muted-foreground" aria-live="polite">
        {done ? (
          <span className="text-foreground">Your order qualifies for free standard delivery.</span>
        ) : (
          <>
            Spend <span className="tabular text-foreground">{usd(remaining)}</span> more for free
            standard delivery.
          </>
        )}
      </p>
      <div
        className="mt-2 h-[2px] overflow-hidden bg-border"
        role="meter"
        aria-label="Progress to free standard delivery"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className={cn(
            "h-full origin-left transition-transform duration-700 ease-out",
            done ? "bg-success" : "bg-foreground",
          )}
          style={{ transform: `scaleX(${pct / 100})` }}
        />
      </div>
    </div>
  );
}
