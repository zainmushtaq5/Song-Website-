"use client";

import { ListPlus, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/toast";
import type { PlaylistSummary } from "@/types/api";

interface AddToPlaylistProps {
  songId: string;
}

/** Compact popover: pick one of the user's playlists (or create one) to add the song to. */
export function AddToPlaylist({ songId }: AddToPlaylistProps) {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function loadPlaylists() {
    try {
      setPlaylists(await api<PlaylistSummary[]>("/api/playlists/mine"));
    } catch {
      setPlaylists([]);
    }
  }

  function onOpen() {
    if (!user) {
      toast("Log in to add songs to playlists", "info");
      return;
    }
    setOpen((o) => {
      if (!o && playlists === null) void loadPlaylists();
      return !o;
    });
  }

  async function addTo(playlistId: string, playlistName: string) {
    setBusy(true);
    try {
      await api(`/api/playlists/${playlistId}/songs`, { method: "POST", json: { song_id: songId } });
      toast(`Added to ${playlistName}`, "success");
      await loadPlaylists();
    } catch (err) {
      toast(err instanceof Error && err.message.includes("already") ? "Already in this playlist" : "Could not add to playlist", "error");
    } finally {
      setBusy(false);
    }
  }

  async function createAndAdd() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const created = await api<PlaylistSummary>("/api/playlists", { method: "POST", json: { name } });
      await api(`/api/playlists/${created.id}/songs`, { method: "POST", json: { song_id: songId } });
      toast(`Created ${name} and added song`, "success");
      setNewName("");
      setOpen(false);
    } catch {
      toast("Could not create playlist", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={onOpen}
        aria-label="Add to playlist"
        className="flex h-10 w-10 items-center justify-center rounded-pill text-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <ListPlus className="h-4 w-4" aria-hidden />
      </button>

      {open && (
        <div className="absolute bottom-11 right-0 z-50 w-60 rounded-card border border-line bg-surface-2 p-2 shadow-xl">
          <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Add to playlist
          </p>
          {playlists === null ? (
            <p className="px-2 py-1.5 text-xs text-muted">Loading…</p>
          ) : playlists.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted">No playlists yet</p>
          ) : (
            <ul className="max-h-40 overflow-y-auto">
              {playlists.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => addTo(p.id, p.name)}
                    disabled={busy}
                    className="flex w-full items-center justify-between rounded-card px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface hover:text-accent"
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="ml-2 shrink-0 text-[11px] text-muted">{p.song_count}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1.5 flex gap-1.5 border-t border-line/60 pt-1.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createAndAdd()}
              placeholder="New playlist…"
              maxLength={120}
              aria-label="New playlist name"
              className="h-8 min-w-0 flex-1 rounded-card border border-line bg-surface px-2 text-xs outline-none placeholder:text-muted/60 focus:border-accent"
            />
            <button
              onClick={createAndAdd}
              disabled={busy || !newName.trim()}
              aria-label="Create playlist and add song"
              className="h-8 shrink-0 rounded-card bg-accent px-2 text-xs font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
