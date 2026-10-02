"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { ChevronUp, Music4, Pause, Play, Repeat, Repeat1, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useRef, useState } from "react";

import { NowPlayingSheet } from "@/components/music/now-playing-sheet";
import { audioElementRef } from "@/components/music/player";
import { Visualizer } from "@/components/music/visualizer";
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
  const seekBarRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);

  // Fall back to the placeholder when the (dynamic) cover URL fails to load.
  const coverSrc = song.cover_url ? resolveMediaUrl(song.cover_url) : null;
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const showCover = Boolean(coverSrc) && coverSrc !== failedCover;

  const progress = total > 0 ? Math.min(1, position / total) : 0;
  const displayPos = dragging ? dragValue : position;
  const displayProgress = total > 0 ? Math.min(1, displayPos / total) : 0;

  function getSeekValue(clientX: number): number {
    const bar = seekBarRef.current;
    if (!bar || total <= 0) return 0;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * total);
  }

  function commitSeek(value: number) {
    usePlayerStore.setState({ position: value });
    if (audioElementRef.current) audioElementRef.current.currentTime = value;
  }
  return (
    <>
    <motion.div
      initial={reduced ? false : { y: 90, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={reduced ? undefined : { y: 90, opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className="fixed inset-x-0 bottom-[calc(3.5rem+var(--safe-b))] z-40 border-t border-line bg-surface/95 backdrop-blur sm:bottom-0 sm:pb-[var(--safe-b)]"
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
        <div className="flex min-w-0 flex-1 items-center gap-2.5 md:flex-none md:w-56 md:shrink-0">
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
          {/* Compact level meter so the bar reads as "playing", not just "loaded". */}
          <Visualizer
            active={isPlaying}
            bars={4}
            height={26}
            mirror
            className="w-5 shrink-0 opacity-90"
          />
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
            className="hidden lg:inline-flex"
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
            className="hidden lg:inline-flex"
          >
            <SkipForward className="h-4 w-4 fill-current" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => usePlayerStore.getState().cycleRepeat()}
            ariaLabel={`Repeat: ${repeat}`}
            className={`hidden lg:inline-flex ${repeat !== "off" ? "text-accent" : ""}`}
          >
            {repeat === "one" ? (
              <Repeat1 className="h-4 w-4" aria-hidden />
            ) : (
              <Repeat className="h-4 w-4" aria-hidden />
            )}
          </Button>
        </div>

        {/* Seek */}
        <div className="hidden lg:flex min-w-0 flex-1 items-center gap-2">
          <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted">
            {formatDuration(dragging ? dragValue : position)}
          </span>
          {/* Custom seek bar — works reliably on all devices including touch */}
          <div
            ref={seekBarRef}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={total || 1}
            aria-valuenow={Math.round(dragging ? dragValue : position)}
            tabIndex={total > 0 ? 0 : -1}
            className={`relative h-4 flex-1 flex items-center cursor-pointer group ${total <= 0 ? "opacity-40 pointer-events-none" : ""}`}
            onPointerDown={(e) => {
              if (total <= 0) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              setDragging(true);
              const v = getSeekValue(e.clientX);
              setDragValue(v);
            }}
            onPointerMove={(e) => {
              if (!dragging) return;
              setDragValue(getSeekValue(e.clientX));
            }}
            onPointerUp={(e) => {
              if (!dragging) return;
              const v = getSeekValue(e.clientX);
              setDragging(false);
              commitSeek(v);
            }}
            onPointerCancel={() => setDragging(false)}
            onKeyDown={(e) => {
              if (!total) return;
              const step = e.shiftKey ? 30 : 5;
              if (e.key === "ArrowRight") { e.preventDefault(); commitSeek(Math.min(total, position + step)); }
              if (e.key === "ArrowLeft")  { e.preventDefault(); commitSeek(Math.max(0, position - step)); }
            }}
          >
            {/* Track background */}
            <div className="absolute inset-x-0 h-1 rounded-full bg-line/60" />
            {/* Filled portion */}
            <div
              className="absolute left-0 h-1 rounded-full bg-accent transition-[width] duration-75 ease-linear"
              style={{ width: `${displayProgress * 100}%` }}
            />
            {/* Thumb */}
            <div
              className="absolute h-3 w-3 rounded-full bg-accent shadow-sm transition-transform duration-75 group-hover:scale-125"
              style={{ left: `calc(${displayProgress * 100}% - 6px)` }}
            />
          </div>
          <span className="w-10 shrink-0 text-[11px] tabular-nums text-muted">
            {formatDuration(total)}
          </span>
        </div>

        {/* Volume */}
        <div className="hidden items-center gap-1.5 lg:flex lg:w-32 lg:shrink-0">
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
