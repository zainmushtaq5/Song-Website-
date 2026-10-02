"use client";

import Link from "next/link";
import { Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { useState, type Dispatch, type SetStateAction } from "react";

import { AdminSongEditor } from "@/components/music/admin-song-editor";
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

/** Statuses the admin song view can list. ALL is the direct-management view. */
export type SongFilter = "PENDING" | "APPROVED" | "REJECTED" | "ALL";

const FILTERS: { id: SongFilter; label: string }[] = [
  { id: "PENDING", label: "Pending" },
  { id: "APPROVED", label: "Approved" },
  { id: "REJECTED", label: "Rejected" },
  { id: "ALL", label: "All songs" },
];

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-yellow-500/15 text-yellow-300",
  APPROVED: "bg-green-500/15 text-green-300",
  REJECTED: "bg-red-500/15 text-red-300",
  REMOVED: "bg-red-500/15 text-red-300",
};

/**
 * Admin song management: the review queue (approve/reject) plus direct edit and
 * soft-delete actions on any song, independent of what the artist submitted.
 */
export function AdminQueue({
  songs,
  error,
  setSongs,
  filter,
  setFilter,
}: {
  songs: Song[] | null;
  error: string | null;
  setSongs: Dispatch<SetStateAction<Song[] | null>>;
  filter: SongFilter;
  setFilter: (filter: SongFilter) => void;
}) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Song | null>(null);
  const [deleting, setDeleting] = useState<Song | null>(null);

  function replace(updated: Song) {
    setSongs((prev) => (prev ?? []).map((s) => (s.id === updated.id ? updated : s)));
  }

  async function approve(song: Song) {
    try {
      await api(`/api/admin/songs/${song.id}/approve`, { method: "POST" });
      toast(`Approved “${song.title}”`, "success");
      setSongs((prev) => (prev ?? []).filter((s) => s.id !== song.id));
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
      await api(`/api/admin/songs/${song.id}/reject`, { method: "POST", json: { rejection_reason: reason } });
      toast(`Rejected “${song.title}”`, "success");
      setSongs((prev) => (prev ?? []).filter((s) => s.id !== song.id));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Reject failed", "error");
    }
  }

  async function remove(song: Song) {
    const reason = (reasons[song.id] ?? "").trim();
    try {
      await api(`/api/admin/songs/${song.id}`, {
        method: "DELETE",
        json: reason ? { reason } : undefined,
      });
      toast(`Deleted “${song.title}” — it is out of the public feed`, "success");
      // A soft delete hides the song everywhere, so drop it from every list view.
      setSongs((prev) => (prev ?? []).filter((s) => s.id !== song.id));
      setDeleting(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed", "error");
    }
  }

  const pills = (
    <div
      role="tablist"
      aria-label="Song status filter"
      className="mb-4 flex flex-wrap items-center gap-1 rounded-pill border border-line bg-surface p-1"
    >
      {FILTERS.map((f) => (
        <button
          key={f.id}
          role="tab"
          aria-selected={filter === f.id}
          data-testid={`admin-filter-${f.id}`}
          onClick={() => setFilter(f.id)}
          className={`rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors ${
            filter === f.id ? "bg-accent text-white" : "text-muted hover:bg-surface-2 hover:text-ink"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );

  if (songs === null) {
    return (
      <div>
        {pills}
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div>
        {pills}
        <EmptyState
          icon={<ShieldCheck className="h-6 w-6" aria-hidden />}
          title="Failed to load songs"
          message={error}
        />
      </div>
    );
  }

  return (
    <div>
      {pills}
      {songs.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-6 w-6" aria-hidden />}
          title={filter === "PENDING" ? "Queue clear" : "No songs here"}
          message={
            filter === "PENDING"
              ? "No songs waiting for review."
              : `No songs with status ${filter} to manage.`
          }
        />
      ) : (
        <ul className="flex flex-col gap-3" data-testid="admin-song-list">
          {songs.map((song) => (
            <li
              key={song.id}
              data-testid="admin-song-row"
              data-song-id={song.id}
              className="rounded-card border border-line bg-surface p-4"
            >
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
              <div className="flex items-center gap-2">
                <Link href={`/song/${song.slug}`} className="truncate font-semibold hover:text-accent">
                  {song.title}
                </Link>
                <span
                  data-testid="admin-song-status"
                  className={`shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[song.status]}`}
                >
                  {song.status}
                </span>
              </div>
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
            {song.status === "PENDING" && (
              <>
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
              </>
            )}
            <Button
              variant="secondary"
              size="sm"
              data-testid="admin-edit"
              ariaLabel={`Edit ${song.title}`}
              onClick={() => {
                setDeleting(null);
                setEditing(song);
              }}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit
            </Button>
            <Button
              variant="danger"
              size="sm"
              data-testid="admin-delete"
              ariaLabel={`Delete ${song.title}`}
              onClick={() => setDeleting(deleting?.id === song.id ? null : song)}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete
            </Button>
          </div>

          {deleting?.id === song.id && (
            <div
              data-testid="admin-delete-confirm"
              className="mt-3 rounded-card border border-red-500/40 bg-red-500/10 p-3"
            >
              <p className="text-xs text-ink">
                Soft-delete “{song.title}”? It disappears from the feed, search, playlist pages and its own
                URL immediately. The row and its files are kept.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Reason (optional, recorded in the audit log)"
                  aria-label={`Deletion reason for ${song.title}`}
                  maxLength={2000}
                  data-testid="admin-delete-reason"
                  value={reasons[song.id] ?? ""}
                  onChange={(e) => setReasons((r) => ({ ...r, [song.id]: e.target.value }))}
                  className="h-9 min-w-48 flex-1 rounded-card border border-line bg-surface px-3 text-xs outline-none placeholder:text-muted/60 focus:border-accent"
                />
                <Button variant="ghost" size="sm" onClick={() => setDeleting(null)}>
                  Cancel
                </Button>
                <Button variant="danger" size="sm" data-testid="admin-delete-submit" onClick={() => remove(song)}>
                  Delete song
                </Button>
              </div>
            </div>
          )}
        </li>
          ))}
        </ul>
      )}

      {editing && (
        <AdminSongEditor song={editing} onClose={() => setEditing(null)} onSaved={replace} />
      )}
    </div>
  );
}
