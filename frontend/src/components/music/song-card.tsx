"use client";

import Link from "next/link";
import { Music4, Pause, Play } from "lucide-react";

import { DownloadButton } from "@/components/music/download-button";
import { LikeButton } from "@/components/music/like-button";
import { resolveMediaUrl } from "@/lib/api-url";
import { formatDuration } from "@/lib/format";
import { usePlayerStore } from "@/stores/player";
import type { Song } from "@/types/api";

interface SongCardProps {
  song: Song;
  queue?: Song[];
}

export function SongCard({ song, queue }: SongCardProps) {
  const playSong = usePlayerStore((s) => s.playSong);
  const current = usePlayerStore((s) => s.current());
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isCurrent = current?.id === song.id;

  function onPlay() {
    playSong(song, queue);
  }

  return (
    <article className="group relative w-full transition-transform duration-300 ease-out hover:-translate-y-1.5">
      <div className="relative aspect-square w-full overflow-hidden rounded-card border border-line bg-surface-2 shadow-none transition-all duration-300 group-hover:border-accent/40 group-hover:shadow-xl group-hover:shadow-accent/20">
        {song.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- backend covers are dynamic signed URLs
          <img
            src={resolveMediaUrl(song.cover_url) ?? undefined}
            alt={`${song.title} cover art`}
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.06]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-accent" aria-hidden>
            <Music4 className="h-8 w-8" />
          </div>
        )}
        <button
          onClick={onPlay}
          aria-label={isCurrent && isPlaying ? `Pause ${song.title}` : `Play ${song.title}`}
          className="absolute bottom-2 right-2 flex h-11 w-11 translate-y-1 items-center justify-center rounded-pill bg-accent text-white opacity-0 shadow-lg transition-all duration-200 hover:bg-accent-strong focus-visible:translate-y-0 focus-visible:opacity-100 group-hover:translate-y-0 group-hover:opacity-100"
        >
          {isCurrent && isPlaying ? (
            <Pause className="h-5 w-5 fill-current" aria-hidden />
          ) : (
            <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden />
          )}
        </button>
        {isCurrent && (
          <span className="absolute left-2 top-2 rounded-pill bg-accent/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            {isPlaying ? "Playing" : "Paused"}
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-start justify-between gap-1">
        <div className="min-w-0">
          <Link
            href={`/song/${song.slug}`}
            className="block truncate text-sm font-semibold transition-colors duration-150 hover:text-accent"
          >
            {song.title}
          </Link>
          {song.artist_slug && (
            <Link
              href={`/artists/${song.artist_slug}`}
              className="block truncate text-xs text-muted transition-colors duration-150 hover:text-ink"
            >
              {song.artist_name}
            </Link>
          )}
          <p className="mt-0.5 text-[11px] text-muted/70">
            {formatDuration(song.duration_sec)}
            {song.download_allowed && <span aria-hidden> · ⤓</span>}
          </p>
        </div>
        <div className="flex shrink-0 flex-col">
          <LikeButton songId={song.id} likeCount={song.like_count} />
          <DownloadButton
            songId={song.id}
            songTitle={song.title}
            downloadAllowed={song.download_allowed}
          />
        </div>
      </div>
    </article>
  );
}
