"use client";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** Reads design tokens so marks follow the active theme (validated chart color, recessive grid/axes). */
function useTokens() {
  const { resolvedTheme } = useTheme();
  const [t, setT] = useState({
    mark: "#12917f",
    grid: "#e3e0d8",
    axis: "#565c66",
    surface: "#ffffff",
    text: "#14171c",
  });
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string) => cs.getPropertyValue(n).trim();
    setT({
      mark: v("--chart-1"),
      grid: v("--border"),
      axis: v("--muted-foreground"),
      surface: v("--card"),
      text: v("--foreground"),
    });
  }, [resolvedTheme]);
  return t;
}

export interface Point {
  label: string;
  value: number;
}

function ChartTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  format: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-card">
      <p className="text-muted-foreground">{label}</p>
      <p className="tabular font-semibold text-foreground">{format(payload[0]!.value)}</p>
    </div>
  );
}

function TableView({
  data,
  format,
  valueLabel,
}: {
  data: Point[];
  format: (n: number) => string;
  valueLabel: string;
}) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted-foreground">View as table</summary>
      <table className="mt-2 w-full">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1 font-medium">Label</th>
            <th className="py-1 text-right font-medium">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label} className="border-t border-border">
              <td className="py-1">{d.label}</td>
              <td className="tabular py-1 text-right">{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function SingleBarChart({
  data,
  format = (n) => n.toLocaleString(),
  valueLabel,
  height = 220,
  ariaLabel,
}: {
  data: Point[];
  format?: (n: number) => string;
  valueLabel: string;
  height?: number;
  ariaLabel: string;
}) {
  const t = useTokens();
  return (
    <figure aria-label={ariaLabel}>
      <div style={{ height }} role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            barCategoryGap={2}
          >
            <CartesianGrid vertical={false} stroke={t.grid} strokeDasharray="0" />
            <XAxis
              dataKey="label"
              tick={{ fill: t.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: t.grid }}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis
              tick={{ fill: t.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => format(v)}
            />
            <Tooltip
              cursor={{ fill: t.grid, opacity: 0.4 }}
              content={<ChartTooltip format={format} />}
            />
            <Bar
              dataKey="value"
              fill={t.mark}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              stroke={t.surface}
              strokeWidth={1}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TableView data={data} format={format} valueLabel={valueLabel} />
    </figure>
  );
}

export function SingleLineChart({
  data,
  format = (n) => n.toLocaleString(),
  valueLabel,
  height = 220,
  ariaLabel,
}: {
  data: Point[];
  format?: (n: number) => string;
  valueLabel: string;
  height?: number;
  ariaLabel: string;
}) {
  const t = useTokens();
  return (
    <figure aria-label={ariaLabel}>
      <div style={{ height }} role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={t.grid} />
            <XAxis
              dataKey="label"
              tick={{ fill: t.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: t.grid }}
              minTickGap={16}
            />
            <YAxis
              tick={{ fill: t.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(v: number) => format(v)}
            />
            <Tooltip
              cursor={{ stroke: t.axis, strokeWidth: 1 }}
              content={<ChartTooltip format={format} />}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={t.mark}
              strokeWidth={2}
              dot={{ r: 4, fill: t.mark, stroke: t.surface, strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: t.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <TableView data={data} format={format} valueLabel={valueLabel} />
    </figure>
  );
}
