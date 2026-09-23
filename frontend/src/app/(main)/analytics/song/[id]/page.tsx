"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { UsageChart, type UsageMetric } from "@/components/analytics/usage-chart";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import { formatCount } from "@/lib/format";
import type { SongAnalytics } from "@/types/api";

const WINDOWS = [7, 30, 90] as const;

/** Per-song analytics drilldown: daily plays/likes/downloads for one song. */
export default function SongAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const songId = params?.id;
  const [data, setData] = useState<SongAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number>(30);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!songId) return;
    api<SongAnalytics>(`/api/users/me/analytics/songs/${songId}?window=${days}`)
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load song analytics"),
      );
  }, [songId, days]);

  if (!mounted) return null;

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <EmptyState
          icon={<ArrowLeft className="h-6 w-6" aria-hidden />}
          title="Could not load analytics."
          message={error}
          ctaLabel="Back to uploads"
          ctaHref="/upload"
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  const stats = [
    { label: "Plays (all time)", value: data.totals.plays },
    { label: "Downloads (all time)", value: data.totals.downloads },
    { label: "Likes (all time)", value: data.totals.likes },
  ];
  const chartMetrics: UsageMetric[] = ["plays", "likes", "downloads"];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link
        href="/upload"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to uploads
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Drilldown for {data.song.title}</h1>
          <p className="mt-1 text-xs text-muted">
            Per-song plays, likes, and downloads over the last {data.window} days.
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Analytics time window"
          className="flex items-center gap-1 rounded-pill border border-line bg-surface p-1"
        >
          {WINDOWS.map((w) => (
            <button
              key={w}
              role="tab"
              aria-selected={days === w}
              onClick={() => setDays(w)}
              className={`rounded-pill px-3 py-1 text-xs font-semibold transition-colors ${
                days === w ? "bg-accent text-white" : "text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-card border border-line bg-surface p-4">
            <p className="text-xl font-extrabold leading-none">{formatCount(s.value)}</p>
            <p className="mt-1 text-xs text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {chartMetrics.map((m) => (
          <UsageChart key={m} series={data.series} metric={m} />
        ))}
      </div>

      <Button variant="secondary" className="mt-8" onClick={() => router.push("/upload")}>
        Back to uploads
      </Button>
    </div>
  );
}