"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useState, type Dispatch, type SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState, SkeletonCard } from "@/components/ui/empty-state";
import { resolveMediaUrl } from "@/lib/api-url";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";
import type { Song } from "@/types/api";

const LICENSE_LABELS: Record<string, string> = {
  artist_owned: "Artist-owned",
  royalty_free: "Royalty-free",
  cc_by: "CC BY",
  other: "Other",
};

export function AdminQueue({
  pending,
  error,
  setPending,
}: {
  pending: Song[] | null;
  error: string | null;
  setPending: Dispatch<SetStateAction<Song[] | null>>;
}) {
  const [reasons, setReasons] = useState<Record<string, string>>({});

  async function approve(song: Song) {
    try {
      await api(`/api/admin/songs/${song.id}/approve`, { method: "POST" });
      toast(`Approved “${song.title}”`, "success");
      setPending((prev) => (prev ?? []).filter((s) => s.id !== song.id));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Approve failed", "error");
    }
  }

  async function reject(song: Song) {
    const reason = (reasons[song.id] ?? "").trim();
    if (reason.length < 3) {
      toast("Rejection reason required (min 3 chars)", "error");
      return;
    }
    try {
      await api(`/api/admin/songs/${song.id}/reject`, { method: "POST", json: { reason } });
      toast(`Rejected “${song.title}”`, "success");
      setPending((prev) => (prev ?? []).filter((s) => s.id !== song.id));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Reject failed", "error");
    }
  }

  if (pending === null) {
    return (
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <EmptyState
        icon={<ShieldCheck className="h-6 w-6" aria-hidden />}
        title="Failed to load queue"
        message={error}
      />
    );
  }
  if (pending.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck className="h-6 w-6" aria-hidden />}
        title="Queue clear"
        message="No songs waiting for review."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {pending.map((song) => (
        <li key={song.id} className="rounded-card border border-line bg-surface p-4">
          <div className="flex gap-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-card border border-line bg-surface-2">
              {song.cover_url && (
                // eslint-disable-next-line @next/next/no-img-element -- dynamic URL
                <img
                  src={resolveMediaUrl(song.cover_url) ?? undefined}
                  alt={`${song.title} cover`}
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <Link href={`/song/${song.slug}`} className="truncate font-semibold hover:text-accent">
                {song.title}
              </Link>
              <p className="truncate text-xs text-muted">
                {song.artist_name} · {song.genre || "No genre"} · {song.duration_sec || "?"}s
              </p>
              <p className="mt-1 truncate text-xs text-muted">
                License: {song.license_type ? (LICENSE_LABELS[song.license_type] ?? song.license_type) : "Streaming only"}
                {song.download_allowed ? " · Downloads allowed" : " · Streaming only"}
              </p>
              {song.rights_note && (
                <p className="mt-1 line-clamp-2 text-xs italic text-muted" title={song.rights_note ?? ""}>
                  {song.rights_note}
                </p>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Rejection reason (required to reject)"
              aria-label={`Rejection reason for ${song.title}`}
              maxLength={500}
              value={reasons[song.id] ?? ""}
              onChange={(e) => setReasons((r) => ({ ...r, [song.id]: e.target.value }))}
              className="h-9 min-w-48 flex-1 rounded-card border border-line bg-surface px-3 text-xs outline-none placeholder:text-muted/60 focus:border-accent"
            />
            <Button onClick={() => approve(song)} variant="secondary" size="sm">
              Approve
            </Button>
            <Button onClick={() => reject(song)} variant="danger" size="sm">
              Reject
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
