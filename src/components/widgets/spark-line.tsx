"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";

import { cn } from "@/lib/utils";

/**
 * Minimal sparkline (Tremor data language) — no axes, no grid, just the
 * trend. `color` is any CSS color; defaults to the primary token.
 */
export function SparkLine({
  data,
  color = "var(--primary)",
  height = 36,
  className,
}: {
  data: number[];
  color?: string;
  height?: number;
  className?: string;
}) {
  const points = data.map((v, i) => ({ i, v }));
  const id = `spark-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${id})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
