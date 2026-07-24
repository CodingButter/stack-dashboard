"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";

export interface TickerSeries {
  name: string;
  color: string; // CSS color
  data: number[];
}

/**
 * Scrolling multi-series line chart for live rates (net rx/tx, disk MB/s).
 * Dashdot-style ticker: newest sample at the right edge.
 */
export function LiveTicker({
  series,
  unit,
  height = 96,
  className,
}: {
  series: TickerSeries[];
  unit?: string;
  height?: number;
  className?: string;
}) {
  const length = Math.max(...series.map((s) => s.data.length), 0);
  const points = Array.from({ length }, (_, i) => {
    const p: Record<string, number> = { i };
    for (const s of series) p[s.name] = s.data[i] ?? 0;
    return p;
  });

  return (
    <div className={cn("w-full", className)}>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <YAxis hide domain={[0, "auto"]} />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={() => ""}
              formatter={(value) => [`${value}${unit ? ` ${unit}` : ""}`]}
            />
            {series.map((s) => (
              <Line
                key={s.name}
                type="monotone"
                dataKey={s.name}
                stroke={s.color}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1">
            <span
              className="size-1.5 rounded-full"
              style={{ background: s.color }}
            />
            {s.name}
            <span className="stat-num text-foreground">
              {s.data[s.data.length - 1] ?? 0}
              {unit ? ` ${unit}` : ""}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
