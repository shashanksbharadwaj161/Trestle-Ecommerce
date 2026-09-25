import { usd } from "@/lib/format";
import { cn } from "@/lib/cn";

export function Price({ micros, className }: { micros: string | bigint | number; className?: string }) {
  return <span className={cn("tabular", className)}>{usd(micros, { cents: !isWhole(micros) })}</span>;
}

function isWhole(m: string | bigint | number) {
  return BigInt(m) % 1_000_000n === 0n;
}
