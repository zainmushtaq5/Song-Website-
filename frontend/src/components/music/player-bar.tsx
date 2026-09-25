"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { ChevronUp, Music4, Pause, Play, Repeat, Repeat1, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useState } from "react";

import { NowPlayingSheet } from "@/components/music/now-playing-sheet";
import { audioElementRef } from "@/components/music/player";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { resolveMediaUrl } from "@/lib/api-url";
import { formatDuration } from "@/lib/format";
import { usePlayerStore } from "@/stores/player";
import type { Song } from "@/types/api";

interface PlayerBarProps {
  song: Song;
  total: number;
  isPlaying: boolean;
}

export function PlayerBar({ song, total, isPlaying }: PlayerBarProps) {
  const position = usePlayerStore((s) => s.position);
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const repeat = usePlayerStore((s) => s.repeat);
  const reduced = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  // Fall back to the placeholder when the (dynamic) cover URL fails to load.
  const coverSrc = song.cover_url ? resolveMediaUrl(song.cover_url) : null;
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const showCover = Boolean(coverSrc) && coverSrc !== failedCover;

  const progress = total > 0 ? Math.min(1, position / total) : 0;

  return (
    <>
    <motion.div
      initial={reduced ? false : { y: 90, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={reduced ? undefined : { y: 90, opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className="fixed inset-x-0 bottom-14 z-40 border-t border-line bg-surface/95 backdrop-blur sm:bottom-0"
    >
      {/* cumulative progress line */}
      <div aria-hidden className="h-0.5 w-full bg-line/60">
        <div
          className="h-full bg-accent transition-[width] duration-150 ease-linear"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2.5 sm:px-6 sm:py-3">
        {/* Track info */}
        <div className="flex min-w-0 items-center gap-2.5 sm:w-56 sm:shrink-0">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Open now playing"
            className="group relative h-10 w-10 shrink-0 overflow-hidden rounded-card bg-surface-2 transition-transform duration-150 hover:scale-105 active:scale-95"
          >
            {showCover ? (
              // eslint-disable-next-line @next/next/no-img-element -- dynamic signed URL
              <img
                src={coverSrc ?? undefined}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setFailedCover(coverSrc)}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-accent" aria-hidden>
                <Music4 className="h-4 w-4" />
              </span>
            )}
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            >
              <ChevronUp className="h-4 w-4 text-white" />
            </span>
          </button>
          <div className="min-w-0">
            <Link
              href={`/song/${song.slug}`}
              className="block truncate text-sm font-semibold transition-colors hover:text-accent"
            >
              {song.title}
            </Link>
            {song.artist_slug && (
              <Link
                href={`/artists/${song.artist_slug}`}
                className="block truncate text-xs text-muted transition-colors hover:text-ink"
              >
                {song.artist_name}
              </Link>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => usePlayerStore.getState().prev()}
            ariaLabel="Previous song"
            className="hidden sm:inline-flex"
          >
            <SkipBack className="h-4 w-4 fill-current" aria-hidden />
          </Button>
          <Button
            variant="primary"
            size="icon"
            onClick={() => usePlayerStore.getState().toggle()}
            ariaLabel={isPlaying ? "Pause" : "Play"}
            className="transition-transform duration-150 active:scale-90"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 fill-current" aria-hidden />
            ) : (
              <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => usePlayerStore.getState().next()}
            ariaLabel="Next song"
            className="hidden sm:inline-flex"
          >
            <SkipForward className="h-4 w-4 fill-current" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => usePlayerStore.getState().cycleRepeat()}
            ariaLabel={`Repeat: ${repeat}`}
            className={`hidden sm:inline-flex ${repeat !== "off" ? "text-accent" : ""}`}
          >
            {repeat === "one" ? (
              <Repeat1 className="h-4 w-4" aria-hidden />
            ) : (
              <Repeat className="h-4 w-4" aria-hidden />
            )}
          </Button>
        </div>

        {/* Seek */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted">
            {formatDuration(position)}
          </span>
          <input
            type="range"
            min={0}
            max={total || 1}
            step={1}
            value={Math.min(position, total || 1)}
            onChange={(e) => {
              const t = Number(e.target.value);
              usePlayerStore.setState({ position: t });
              if (audioElementRef.current) audioElementRef.current.currentTime = t;
            }}
            aria-label="Seek"
            className="h-1 w-full cursor-pointer accent-[var(--color-accent)]"
          />
          <span className="w-10 shrink-0 text-[11px] tabular-nums text-muted">
            {formatDuration(total)}
          </span>
        </div>

        {/* Volume */}
        <div className="hidden items-center gap-1.5 sm:flex sm:w-32 sm:shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => usePlayerStore.getState().toggleMute()}
            ariaLabel={muted ? "Unmute" : "Mute"}
          >
            {muted || volume === 0 ? (
              <VolumeX className="h-4 w-4" aria-hidden />
            ) : (
              <Volume2 className="h-4 w-4" aria-hidden />
            )}
          </Button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) => usePlayerStore.getState().setVolume(Number(e.target.value))}
            aria-label="Volume"
            className="h-1 w-full cursor-pointer accent-[var(--color-accent)]"
          />
        </div>

        {/* Expand to the Now Playing sheet */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setExpanded(true)}
          ariaLabel="Expand player"
          className="shrink-0"
        >
          <ChevronUp className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </motion.div>

    <NowPlayingSheet
      song={song}
      total={total}
      isPlaying={isPlaying}
      open={expanded}
      onClose={() => setExpanded(false)}
    />
    </>
  );
}
