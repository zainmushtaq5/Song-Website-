"use client";

import { Cog, FileCheck, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminJobs } from "@/components/music/admin-jobs";
import { AdminLicenses } from "@/components/music/admin-licenses";
import { AdminQueue } from "@/components/music/admin-queue";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import type { JobInfo, LicenseInfo, Song } from "@/types/api";

type Tab = "songs" | "licenses" | "jobs";

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>("songs");
  const [pending, setPending] = useState<Song[] | null>(null);
  const [licenses, setLicenses] = useState<LicenseInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [licError, setLicError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!user) return;
    api<Song[]>("/api/admin/songs?review_status=PENDING")
      .then(setPending)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load review queue");
        setPending([]);
      });
    api<LicenseInfo[]>("/api/admin/licenses?review_status=PENDING")
      .then(setLicenses)
      .catch((err: unknown) => {
        setLicError(err instanceof Error ? err.message : "Failed to load license queue");
        setLicenses([]);
      });
  }, [user]);

  if (!mounted) return null;

  if (!user) {
    return (
      <EmptyState
        icon={<ShieldCheck className="h-6 w-6" aria-hidden />}
        title="Admin access"
        message="Log in with an admin account to review submissions."
        ctaLabel="Log in"
        ctaHref="/login?next=/admin"
      />
    );
  }
  if (user.role !== "ADMIN") {
    return (
      <EmptyState
        icon={<ShieldCheck className="h-6 w-6" aria-hidden />}
        title="Not authorized"
        message="This area is restricted to admins."
      />
    );
  }

  const tabs: { id: Tab; label: string; count: number | null }[] = [
    { id: "songs", label: "Song review", count: pending?.length ?? null },
    { id: "licenses", label: "License review", count: licenses?.length ?? null },
    { id: "jobs", label: "Jobs", count: null },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-xl font-extrabold tracking-tight">Admin</h1>
      <div role="tablist" aria-label="Admin queues" className="mt-4 flex items-center gap-1 rounded-pill border border-line bg-surface p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === t.id ? "bg-accent text-white" : "text-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {t.id === "songs" ? (
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            ) : t.id === "licenses" ? (
              <FileCheck className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Cog className="h-3.5 w-3.5" aria-hidden />
            )}
            {t.label}
            {t.count !== null && t.count > 0 && (
              <span className="rounded-pill bg-white/20 px-1.5 text-[10px] font-bold">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "songs" ? (
          <AdminQueue pending={pending} error={error} setPending={setPending} />
        ) : tab === "licenses" ? (
          <AdminLicenses pending={licenses} error={licError} setPending={setLicenses} />
        ) : (
          <AdminJobs />
        )}
      </div>
    </div>
  );
}
