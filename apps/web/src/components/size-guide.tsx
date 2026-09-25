"use client";
import { useState } from "react";
import { cmToIn, type SizeChart } from "@trestle/shared";
import { cn } from "@/lib/cn";

/** Size chart table with a cm / in toggle. Measurements are body measurements. */
export function SizeChartTable({ chart, highlight }: { chart: SizeChart; highlight?: string | null }) {
  const [unit, setUnit] = useState<"cm" | "in">("cm");
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[0.8125rem] text-muted-foreground">{chart.title} — body measurements</p>
        <div role="radiogroup" aria-label="Units" className="inline-flex border border-border text-xs">
          {(["cm", "in"] as const).map((u) => (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={unit === u}
              onClick={() => setUnit(u)}
              className={cn("h-8 px-3", unit === u && "bg-foreground text-background")}
            >
              {u}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Table (scrolls horizontally)">
        <table className="w-full min-w-[320px] border-collapse text-sm">
          <caption className="sr-only">
            {chart.title} size chart in {unit === "cm" ? "centimetres" : "inches"}
          </caption>
          <thead>
            <tr className="border-b border-foreground text-left">
              <th scope="col" className="py-2 pr-4 font-medium">
                Size
              </th>
              {chart.columns.map((c) => (
                <th key={c} scope="col" className="py-2 pr-4 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular">
            {chart.rows.map((r) => (
              <tr key={r.size} className={cn("border-b border-border", highlight === r.size && "bg-muted")}>
                <th scope="row" className="py-2 pr-4 text-left font-medium">
                  {r.size}
                </th>
                {r.values.map((v, i) => (
                  <td key={i} className="py-2 pr-4 text-muted-foreground">
                    {unit === "cm" ? v : cmToIn(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="mt-6 text-sm font-medium">How to measure</h3>
      <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
        {chart.howToMeasure.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </div>
  );
}
