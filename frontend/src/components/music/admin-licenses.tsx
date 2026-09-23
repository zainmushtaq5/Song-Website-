"use client";

import Link from "next/link";
import { FileCheck } from "lucide-react";
import { useState, type Dispatch, type SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";
import type { LicenseInfo } from "@/types/api";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-yellow-500/15 text-yellow-300",
  APPROVED: "bg-green-500/15 text-green-300",
  REJECTED: "bg-red-500/15 text-red-300",
  EXPIRED: "bg-orange-500/15 text-orange-300",
  SUSPENDED: "bg-orange-500/15 text-orange-300",
  REMOVED: "bg-red-500/15 text-red-300",
};

export function AdminLicenses({
  pending,
  error,
  setPending,
}: {
  pending: LicenseInfo[] | null;
  error: string | null;
  setPending: Dispatch<SetStateAction<LicenseInfo[] | null>>;
}) {
  const [reasons, setReasons] = useState<Record<string, string>>({});

  async function approve(lic: LicenseInfo) {
    try {
      await api(`/api/admin/licenses/${lic.id}/approve`, { method: "POST", json: { note: null } });
      toast(`License approved for “${lic.song_title ?? "song"}”`, "success");
      setPending((prev) => (prev ?? []).filter((l) => l.id !== lic.id));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Approve failed", "error");
    }
  }

  async function reject(lic: LicenseInfo) {
    const reason = (reasons[lic.id] ?? "").trim();
    if (reason.length < 3) {
      toast("Rejection reason required (min 3 chars)", "error");
      return;
    }
    try {
      await api(`/api/admin/licenses/${lic.id}/reject`, { method: "POST", json: { reason } });
      toast(`License rejected for “${lic.song_title ?? "song"}”`, "success");
      setPending((prev) => (prev ?? []).filter((l) => l.id !== lic.id));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Reject failed", "error");
    }
  }

  if (pending === null) {
    return <p className="text-sm text-muted">Loading…</p>;
  }
  if (error) {
    return (
      <EmptyState
        icon={<FileCheck className="h-6 w-6" aria-hidden />}
        title="Failed to load license queue"
        message={error}
      />
    );
  }
  if (pending.length === 0) {
    return (
      <EmptyState
        icon={<FileCheck className="h-6 w-6" aria-hidden />}
        title="No licenses waiting"
        message="No license submissions to review right now."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {pending.map((lic) => (
        <li key={lic.id} className="rounded-card border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{lic.song_title ?? "Unknown song"}</p>
              <p className="truncate text-xs text-muted">
                {lic.artist_name ?? "Unknown artist"} · {lic.license_type ?? "—"} · holder:{" "}
                {lic.rights_holder ?? "—"}
              </p>
              {lic.proof_reference && (
                <p className="mt-1 truncate text-xs text-muted" title={lic.proof_reference}>
                  Proof: {lic.proof_reference}
                </p>
              )}
              {lic.effective_until && (
                <p className="text-xs text-muted">Valid until: {lic.effective_until.slice(0, 10)}</p>
              )}
            </div>
            <span className={`shrink-0 rounded-pill px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[lic.status]}`}>
              {lic.status}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Rejection reason (required to reject)"
              aria-label={`Rejection reason for license ${lic.id}`}
              maxLength={500}
              value={reasons[lic.id] ?? ""}
              onChange={(e) => setReasons((r) => ({ ...r, [lic.id]: e.target.value }))}
              className="h-9 min-w-48 flex-1 rounded-card border border-line bg-surface px-3 text-xs outline-none placeholder:text-muted/60 focus:border-accent"
            />
            <Button onClick={() => approve(lic)} variant="secondary" size="sm">
              Approve
            </Button>
            <Button onClick={() => reject(lic)} variant="danger" size="sm">
              Reject
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}