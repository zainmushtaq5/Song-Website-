"use client";

import Link from "next/link";
import { Flame, Heart, Music4, Pause, Play, ShieldCheck } from "lucide-react";

import { DownloadButton } from "@/components/music/download-button";
import { LikeButton } from "@/components/music/like-button";
import { Button } from "@/components/ui/button";
import { resolveMediaUrl } from "@/lib/api-url";
import { formatCount, formatDuration } from "@/lib/format";
import { usePlayerStore } from "@/stores/player";
import type { Song } from "@/types/api";

const LICENSE_LABELS: Record<string, string> = {
  royalty_free: "Royalty free",
  artist_owned: "Artist owned",
  cc_by: "CC BY",
  other: "Custom license",
};

export function SongDetail({ song }: { song: Song }) {
  const playSong = usePlayerStore((s) => s.playSong);
  const isCurrent = usePlayerStore((s) => s.current()?.id === song.id);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="aspect-square w-full max-w-64 shrink-0 self-center overflow-hidden rounded-card border border-line bg-surface-2 sm:self-start">
          {song.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- dynamic signed URL
            <img
              src={resolveMediaUrl(song.cover_url) ?? undefined}
              alt={`${song.title} cover art`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-accent" aria-hidden>
              <Music4 className="h-12 w-12" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-xs uppercase tracking-widest text-muted">Song</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{song.title}</h1>
          {song.artist_slug && (
            <Link
              href={`/artists/${song.artist_slug}`}
              className="mt-1 text-sm text-muted transition-colors hover:text-accent"
            >
              {song.artist_name}
            </Link>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted">
            {song.genre && <span className="rounded-pill bg-surface-2 px-2.5 py-1">{song.genre}</span>}
            <span className="rounded-pill bg-surface-2 px-2.5 py-1">{formatDuration(song.duration_sec)}</span>
            <span className="flex items-center gap-1 rounded-pill bg-surface-2 px-2.5 py-1">
              <Heart className="h-3 w-3" aria-hidden /> {formatCount(song.like_count)}
            </span>
            <span className="flex items-center gap-1 rounded-pill bg-surface-2 px-2.5 py-1">
              <Flame className="h-3 w-3" aria-hidden /> {formatCount(song.play_count)} plays
            </span>
          </div>

          <div className="mt-6 flex items-center gap-2">
            <Button onClick={() => playSong(song)} size="lg" ariaLabel={isCurrent && isPlaying ? "Pause" : "Play"}>
              {isCurrent && isPlaying ? (
                <Pause className="h-5 w-5 fill-current" aria-hidden />
              ) : (
                <Play className="h-5 w-5 fill-current" aria-hidden />
              )}
              {isCurrent && isPlaying ? "Pause" : "Play"}
            </Button>
            <LikeButton songId={song.id} likeCount={song.like_count} />
            <DownloadButton songId={song.id} songTitle={song.title} downloadAllowed={song.download_allowed} />
          </div>

          {/* Rights info — never hidden per accessibility requirement */}
          <div className="mt-6 rounded-card border border-line bg-surface p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
              {song.download_allowed
                ? `Download available · ${song.license_type ? (LICENSE_LABELS[song.license_type] ?? song.license_type) : "Licensed"}`
                : "Streaming only"}
            </p>
            {song.rights_note && <p className="mt-1.5 text-xs leading-relaxed text-muted">{song.rights_note}</p>}
            {!song.download_allowed && (
              <p className="mt-1.5 text-xs text-muted">The artist has not enabled downloads for this song.</p>
            )}
          </div>

          {song.description && <p className="mt-6 text-sm leading-relaxed text-muted">{song.description}</p>}
        </div>
      </div>
    </div>
  );
}
