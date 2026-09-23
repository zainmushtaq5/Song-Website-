"use client";

import { useMemo } from "react";

import { formatCount } from "@/lib/format";
import type { AnalyticsSeriesPoint } from "@/types/api";

export type UsageMetric = "plays" | "likes" | "downloads";

const METRIC_COLORS: Record<UsageMetric, string> = {
  plays: "var(--color-accent)",
  likes: "#f472b6",
  downloads: "#34d399",
};

interface UsageChartProps {
  series: AnalyticsSeriesPoint[];
  metric: UsageMetric;
  height?: number;
}

/** Hand-rolled SVG bar chart of a daily engagement series — no chart library. */
export function UsageChart({ series, metric, height = 120 }: UsageChartProps) {
  const max = useMemo(() => Math.max(1, ...series.map((d) => d[metric])), [series, metric]);
  const width = 600;
  const pad = 2;
  const barGap = 1;
  const barW = series.length > 0 ? Math.max(1, (width - pad * 2 - barGap * (series.length - 1)) / series.length) : 0;

  const first = series[0]?.date ?? "";
  const last = series[series.length - 1]?.date ?? "";
  const total = series.reduce((acc, d) => acc + d[metric], 0);

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <p className="text-xs font-semibold capitalize" style={{ color: METRIC_COLORS[metric] }}>
          {metric} per day
        </p>
        <p className="text-[11px] tabular-nums text-muted">
          {formatCount(total)} in {series.length} days · {first} → {last}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full rounded-card border border-line bg-surface-2/40"
        role="img"
        aria-label={`Daily ${metric} for the last ${series.length} days`}
        preserveAspectRatio="none"
      >
        {series.map((d, i) => {
          const v = d[metric];
          const h = v === 0 ? 1 : Math.max(2, (v / max) * (height - 8));
          return (
            <rect
              key={d.date}
              x={pad + i * (barW + barGap)}
              y={height - h}
              width={barW}
              height={h}
              rx={Math.min(2, barW / 2)}
              fill={METRIC_COLORS[metric]}
              opacity={v === 0 ? 0.25 : 0.9}
            >
              <title>{`${d.date}: ${v} ${metric}`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}