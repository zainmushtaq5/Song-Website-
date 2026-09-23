"use client";

import { BarChart3 } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { formatCount } from "@/lib/format";
import type { ArtistAnalytics } from "@/types/api";

/** Artist analytics panel: totals, last-7-days activity, top songs. */
export function AnalyticsPanel() {
  const [data, setData] = useState<ArtistAnalytics | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api<ArtistAnalytics>("/api/users/me/analytics")
      .then(setData)
      .catch(() => setError(true));
  }, []);

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

  return (
    <div className="mt-10">
      <h2 className="mb-4 flex items-center gap-2 text-base font-bold tracking-tight">
        <BarChart3 className="h-4.5 w-4.5 text-accent" aria-hidden />
        Analytics
      </h2>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-card border border-line bg-surface p-4">
            <p className="text-xl font-extrabold leading-none">{formatCount(s.value)}</p>
            <p className="mt-1 text-xs text-muted">{s.label}</p>
          </div>
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
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
