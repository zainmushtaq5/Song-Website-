"use client";

import { ListMusic, Music4 } from "lucide-react";

import { SongCard } from "@/components/music/song-card";
import { EmptyState } from "@/components/ui/empty-state";
import { resolveMediaUrl } from "@/lib/api-url";
import type { PlaylistDetail } from "@/types/api";

export function PlaylistDetailContent({ playlist }: { playlist: PlaylistDetail }) {
  const songs = playlist.songs ?? [];

  return (
    <div>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-card border border-line bg-surface-2 sm:h-36 sm:w-36">
          {playlist.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- dynamic signed URL
            <img
              src={resolveMediaUrl(playlist.cover_url) ?? undefined}
              alt={`${playlist.name} cover`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-accent" aria-hidden>
              <ListMusic className="h-10 w-10" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-muted">Playlist</p>
          <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl">{playlist.name}</h1>
          <p className="mt-1 text-sm text-muted">
            by {playlist.owner} · {playlist.song_count} {playlist.song_count === 1 ? "song" : "songs"}
            {!playlist.is_public && " · private"}
          </p>
          {playlist.description && (
            <p className="mt-1.5 max-w-xl text-sm text-muted">{playlist.description}</p>
          )}
        </div>
      </div>

      <h2 className="mb-4 mt-10 flex items-center gap-2 text-lg font-bold tracking-tight">
        <Music4 className="h-4.5 w-4.5 text-accent" aria-hidden />
        Songs
      </h2>
      {songs.length === 0 ? (
        <EmptyState
          icon={<Music4 className="h-6 w-6" aria-hidden />}
          title="This playlist is empty."
          message="Add songs with the playlist button on any song card."
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {songs.map((song) => (
            <SongCard key={song.id} song={song} queue={songs} />
          ))}
        </div>
      )}
    </div>
  );
}
