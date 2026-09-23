"use client";

import { Cog } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";
import type { JobInfo } from "@/types/api";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-yellow-500/15 text-yellow-300",
  PROCESSING: "bg-blue-500/15 text-blue-300",
  DONE: "bg-green-500/15 text-green-300",
  FAILED: "bg-red-500/15 text-red-300",
};

/** Admin view of the background job queue (FFmpeg probes, license sweeps). */
export function AdminJobs() {
  const [jobs, setJobs] = useState<JobInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<JobInfo[]>("/api/admin/jobs")
      .then(setJobs)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load jobs");
        setJobs([]);
      });
  }, []);

  if (jobs === null) return <p className="text-sm text-muted">Loading…</p>;
  if (error) {
    return <EmptyState icon={<Cog className="h-6 w-6" aria-hidden />} title="Failed to load jobs" message={error} />;
  }
  if (jobs.length === 0) {
    return (
      <EmptyState
        icon={<Cog className="h-6 w-6" aria-hidden />}
        title="No jobs yet"
        message="Background jobs (audio probing, license sweeps) will appear here."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {jobs.map((j) => (
        <li
          key={j.id}
          className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{j.type}</p>
            <p className="truncate text-xs text-muted" title={j.last_error ?? ""}>
              {j.last_error ? `Error: ${j.last_error}` : `attempt ${j.attempts}`}
            </p>
          </div>
          <span className={`shrink-0 rounded-pill px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[j.status]}`}>
            {j.status}
          </span>
        </li>
      ))}
    </ul>
  );
}