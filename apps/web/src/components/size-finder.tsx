"use client";
import { useMemo, useState } from "react";
import type { SizeChart } from "@trestle/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

/**
 * "Find my size": compares the shopper's body measurements with the size chart and suggests the smallest size
 * that fits every measurement entered. An estimate from the chart only — never presented as a guarantee.
 */
export function SizeFinder({ chart, available, onPick }: { chart: SizeChart; available?: string[]; onPick?: (size: string) => void }) {
  const [unit, setUnit] = useState<"cm" | "in">("cm");
  // inseam is a length preference, not a fit constraint, so it is not used for the estimate
  const colIdx = chart.columns.map((c, i) => ({ c, i })).filter(({ c }) => !/inseam/i.test(c)).slice(0, 3);
  const cols = colIdx.map((x) => x.c);
  const [vals, setVals] = useState<string[]>(cols.map(() => ""));
  const result = useMemo(() => {
    const nums = vals.map((v) => (v.trim() ? Number(v) * (unit === "in" ? 2.54 : 1) : null));
    if (nums.every((n) => n === null) || nums.some((n) => n !== null && (!Number.isFinite(n) || n <= 0))) return null;
    const fits = chart.rows.find((r) => nums.every((n, k) => n === null || n <= r.values[colIdx[k]!.i]! + 0.5));
    return fits ? { size: fits.size, over: false } : { size: chart.rows.at(-1)!.size, over: true };
  }, [vals, unit, chart, colIdx]);
  if (chart.rows.length < 2) return null;
  const inStock = result && (!available || available.includes(result.size));
  return (
    <div className="border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Find my size</p>
        <div role="radiogroup" aria-label="Units" className="inline-flex border border-border text-xs">
          {(["cm", "in"] as const).map((u) => (
            <button key={u} type="button" role="radio" aria-checked={unit === u} onClick={() => setUnit(u)} className={cn("h-8 px-3", unit === u && "bg-foreground text-background")}>
              {u}
            </button>
          ))}
        </div>
      </div>
      <div className={cn("mt-3 grid gap-2", cols.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {cols.map((c, i) => (
          <label key={c} className="text-xs text-muted-foreground">
            {c.replace(/\s*\(.*\)/, "")}
            <Input
              inputMode="decimal"
              value={vals[i]}
              onChange={(e) => setVals(vals.map((v, j) => (j === i ? e.target.value : v)))}
              className="mt-1 h-10"
              aria-label={`${c} in ${unit}`}
            />
          </label>
        ))}
      </div>
      <div className="mt-3 min-h-10 text-sm" aria-live="polite">
        {result ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>
              Suggested size: <strong>{result.size}</strong>
              {result.over && " (your measurements are above our largest size)"}
              {!inStock && " — currently sold out in this colour"}
            </p>
            {onPick && inStock && (
              <Button size="sm" variant="outline" onClick={() => onPick(result.size)}>
                Select {result.size}
              </Button>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground">Enter one or more measurements for an estimate from our size chart.</p>
        )}
      </div>
    </div>
  );
}
