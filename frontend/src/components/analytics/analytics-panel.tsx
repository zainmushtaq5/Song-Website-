"use client";

import { BarChart3 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { UsageChart, type UsageMetric } from "@/components/analytics/usage-chart";
import { api } from "@/lib/api";
import { formatCount } from "@/lib/format";
import type { ArtistAnalytics } from "@/types/api";

const WINDOWS = [7, 30, 90] as const;

/** Artist analytics panel: totals, 7/30/90-day charts, top songs. */
export function AnalyticsPanel() {
  const router = useRouter();
  const [data, setData] = useState<ArtistAnalytics | null>(null);
  const [error, setError] = useState(false);
  const [window, setWindow] = useState<number>(30);

  useEffect(() => {
    api<ArtistAnalytics>(`/api/users/me/analytics?window=${window}`)
      .then(setData)
      .catch(() => setError(true));
  }, [window]);

  if (error) return null;
  if (!data) {
    return (
      <div className="mt-10">
        <h2 className="mb-4 text-base font-bold tracking-tight">Analytics</h2>
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  const stats = [
    { label: "Total plays", value: data.totals.plays },
    { label: "Downloads", value: data.totals.downloads },
    { label: "Likes", value: data.totals.likes },
  ];
  const chartMetrics: UsageMetric[] = ["plays", "likes", "downloads"];

  return (
    <div className="mt-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
          <BarChart3 className="h-4.5 w-4.5 text-accent" aria-hidden />
          Analytics
        </h2>
        <div
          role="tablist"
          aria-label="Analytics time window"
          className="flex items-center gap-1 rounded-pill border border-line bg-surface p-1"
        >
          {WINDOWS.map((w) => (
            <button
              key={w}
              role="tab"
              aria-selected={window === w}
              onClick={() => setWindow(w)}
              className={`rounded-pill px-3 py-1 text-xs font-semibold transition-colors ${
                window === w ? "bg-accent text-white" : "text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-card border border-line bg-surface p-4">
            <p className="text-xl font-extrabold leading-none">{formatCount(s.value)}</p>
            <p className="mt-1 text-xs text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {chartMetrics.map((m) => (
          <UsageChart key={m} series={data.series} metric={m} />
        ))}
      </div>

      <p className="mt-3 text-xs text-muted">
        Last 7 days: {data.last_7_days.plays} {data.last_7_days.plays === 1 ? "play" : "plays"} ·{" "}
        {data.last_7_days.downloads} {data.last_7_days.downloads === 1 ? "download" : "downloads"} (30-day
        plays: {data.last_30_days.plays})
      </p>

      {data.top_songs.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-card border border-line bg-surface">
          <p className="border-b border-line/60 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Top songs
          </p>
          <ul className="divide-y divide-line/40">
            {data.top_songs.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-4 shrink-0 text-xs font-bold text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{s.title}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted">
                  {formatCount(s.plays)} plays · {formatCount(s.likes)} likes
                </span>
                <button
                  onClick={() => router.push(`/analytics/song/${s.id}`)}
                  aria-label={`Drill down: ${s.title}`}
                  className="shrink-0 rounded-pill border border-line px-2.5 py-1 text-[11px] font-semibold text-muted transition-colors hover:border-accent hover:text-accent"
                >
                  Drill down
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
