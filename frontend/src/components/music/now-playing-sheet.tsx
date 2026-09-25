"use client";

import Link from "next/link";
import {
  ChevronDown,
  Music4,
  Pause,
  Play,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { audioElementRef } from "@/components/music/player";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { resolveMediaUrl } from "@/lib/api-url";
import { formatDuration } from "@/lib/format";
import { usePlayerStore } from "@/stores/player";
import type { Song } from "@/types/api";

interface NowPlayingSheetProps {
  song: Song;
  total: number;
  isPlaying: boolean;
  open: boolean;
  onClose: () => void;
}

/** Shared spring so the panel opens with the same feel as the player bar. */
const SPRING = { type: "spring", stiffness: 300, damping: 32 } as const;

function seekTo(seconds: number) {
  usePlayerStore.setState({ position: seconds });
  if (audioElementRef.current) audioElementRef.current.currentTime = seconds;
}

/**
 * Full-screen "Now playing" sheet that springs up from the player bar.
 * Supports swipe-to-dismiss, Escape, scroll lock, and renders statically
 * (no spring, no drag) when the user prefers reduced motion.
 */
export function NowPlayingSheet({ song, total, isPlaying, open, onClose }: NowPlayingSheetProps) {
  const position = usePlayerStore((s) => s.position);
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const repeat = usePlayerStore((s) => s.repeat);
  const reduced = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Fall back to the placeholder when the (dynamic) cover URL fails to load.
  const coverSrc = song.cover_url ? resolveMediaUrl(song.cover_url) : null;
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const showCover = Boolean(coverSrc) && coverSrc !== failedCover;

  // Escape to dismiss, lock background scroll, and move focus into the dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex flex-col justify-end"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduced ? undefined : { opacity: 0 }}
          transition={reduced ? undefined : { duration: 0.2 }}
        >
          {/* Backdrop — clicking dismisses the sheet */}
          <button
            type="button"
            aria-label="Close now playing"
            onClick={onClose}
            className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label="Now playing"
            initial={reduced ? false : { y: "100%" }}
            animate={{ y: 0 }}
            exit={reduced ? undefined : { y: "100%" }}
            transition={SPRING}
            drag={reduced ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
            className="relative mx-auto max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line bg-surface px-5 pb-8 pt-3 shadow-2xl"
          >
            {/* Drag handle */}
            <div aria-hidden className="mx-auto mb-2 h-1.5 w-12 rounded-pill bg-line" />

            <div className="mb-4 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted">
                Now playing
              </p>
              <Button
                ref={closeRef}
                variant="ghost"
                size="icon"
                onClick={onClose}
                ariaLabel="Collapse now playing"
              >
                <ChevronDown className="h-5 w-5" aria-hidden />
              </Button>
            </div>

            {/* Artwork */}
            <div className="mx-auto mb-5 h-52 w-52 overflow-hidden rounded-3xl bg-surface-2 shadow-lg">
              {showCover ? (
                // eslint-disable-next-line @next/next/no-img-element -- dynamic signed URL
                <img
                  src={coverSrc ?? undefined}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={() => setFailedCover(coverSrc)}
                />
              ) : (
                <span
                  className="flex h-full w-full items-center justify-center text-accent"
                  aria-hidden
                >
                  <Music4 className="h-10 w-10" />
                </span>
              )}
            </div>

            {/* Track info */}
            <div className="text-center">
              <Link
                href={`/song/${song.slug}`}
                onClick={onClose}
                className="line-clamp-2 text-lg font-extrabold tracking-tight transition-colors hover:text-accent"
              >
                {song.title}
              </Link>
              {song.artist_slug && (
                <Link
                  href={`/artists/${song.artist_slug}`}
                  onClick={onClose}
                  className="mt-1 block text-sm text-muted transition-colors hover:text-ink"
                >
                  {song.artist_name}
                </Link>
              )}
            </div>

            {/* Seek */}
            <div className="mt-5 flex items-center gap-3">
              <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted">
                {formatDuration(position)}
              </span>
              <input
                type="range"
                min={0}
                max={total || 1}
                step={1}
                value={Math.min(position, total || 1)}
                onChange={(e) => seekTo(Number(e.target.value))}
                aria-label="Seek"
                className="h-1 w-full cursor-pointer accent-[var(--color-accent)]"
              />
              <span className="w-10 shrink-0 text-[11px] tabular-nums text-muted">
                {formatDuration(total)}
              </span>
            </div>

            {/* Transport */}
            <div className="mt-5 flex items-center justify-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => usePlayerStore.getState().cycleRepeat()}
                ariaLabel={`Repeat: ${repeat}`}
                className={repeat !== "off" ? "text-accent" : ""}
              >
                {repeat === "one" ? (
                  <Repeat1 className="h-5 w-5" aria-hidden />
                ) : (
                  <Repeat className="h-5 w-5" aria-hidden />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => usePlayerStore.getState().prev()}
                ariaLabel="Previous song"
              >
                <SkipBack className="h-5 w-5 fill-current" aria-hidden />
              </Button>
              <Button
                variant="primary"
                size="icon"
                onClick={() => usePlayerStore.getState().toggle()}
                ariaLabel={isPlaying ? "Pause" : "Play"}
                className="h-14 w-14 transition-transform duration-150 active:scale-90"
              >
                {isPlaying ? (
                  <Pause className="h-6 w-6 fill-current" aria-hidden />
                ) : (
                  <Play className="ml-0.5 h-6 w-6 fill-current" aria-hidden />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => usePlayerStore.getState().next()}
                ariaLabel="Next song"
              >
                <SkipForward className="h-5 w-5 fill-current" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => usePlayerStore.getState().toggleMute()}
                ariaLabel={muted ? "Unmute" : "Mute"}
              >
                {muted || volume === 0 ? (
                  <VolumeX className="h-5 w-5" aria-hidden />
                ) : (
                  <Volume2 className="h-5 w-5" aria-hidden />
                )}
              </Button>
            </div>

            {/* Volume */}
            <div className="mt-3 flex items-center gap-3">
              <span className="w-10 shrink-0 text-[11px] text-muted">Vol</span>
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
              <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted">
                {Math.round((muted ? 0 : volume) * 100)}%
              </span>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

