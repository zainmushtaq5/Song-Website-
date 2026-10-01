"use client";

import Link from "next/link";
import {
  Activity,
  AudioLines,
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
import { useCallback, useEffect, useRef, useState } from "react";

import { audioElementRef } from "@/components/music/player";
import { Visualizer, type VisualizerVariant } from "@/components/music/visualizer";
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

/** Relative seek for the keyboard shortcuts, clamped to the track. */
function seekBy(delta: number) {
  const audio = audioElementRef.current;
  const state = usePlayerStore.getState();
  const total = audio?.duration || state.duration || 0;
  const next = (audio?.currentTime ?? state.position) + delta;
  seekTo(total > 0 ? Math.max(0, Math.min(total, next)) : Math.max(0, next));
}

/** Chosen spectrum style, remembered between sessions. */
const VARIANT_KEY = "songs-visualizer";
/** Arrow-key seek step. */
const SLIDE_SECONDS = 10;

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
  const queue = usePlayerStore((s) => s.queue);
  const currentIndex = usePlayerStore((s) => s.currentIndex);
  const reduced = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const seekBarRef = useRef<HTMLDivElement | null>(null);
  const [variant, setVariant] = useState<VisualizerVariant>("bars");
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);

  function getSeekValue(clientX: number): number {
    const bar = seekBarRef.current;
    if (!bar || total <= 0) return 0;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * total);
  }

  // Upcoming tracks: the queue tail, wrapping when repeat-all is on.
  const upNext: { song: Song; position: number }[] = [];
  for (let step = 1; step < queue.length && upNext.length < 6; step++) {
    const index = currentIndex + step;
    if (index < queue.length) {
      const next = queue[index];
      if (next) upNext.push({ song: next, position: index + 1 });
    } else if (repeat === "all") {
      const wrapped = queue[index % queue.length];
      if (wrapped) upNext.push({ song: wrapped, position: (index % queue.length) + 1 });
    } else {
      break;
    }
  }

  const chooseVariant = (next: VisualizerVariant) => {
    setVariant(next);
    try {
      window.localStorage.setItem(VARIANT_KEY, next);
    } catch {
      /* private mode / quota — the choice simply does not persist */
    }
  };

  /** Bass energy drives the artwork glow; written straight to the DOM. */
  const handleLevel = useCallback((level: number) => {
    const glow = glowRef.current;
    if (!glow) return;
    glow.style.opacity = String(0.15 + level * 0.6);
    glow.style.transform = `scale(${1 + level * 0.07})`;
  }, []);

  // Fall back to the placeholder when the (dynamic) cover URL fails to load.
  const coverSrc = song.cover_url ? resolveMediaUrl(song.cover_url) : null;
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const showCover = Boolean(coverSrc) && coverSrc !== failedCover;

  // Remember the last visualizer style (read after mount so SSR markup matches).
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(VARIANT_KEY);
    } catch {
      /* storage blocked — keep the default */
    }
    if (stored === "bars" || stored === "wave") setVariant(stored);
  }, []);

  // Escape to dismiss, lock background scroll, move focus into the dialog, and
  // expose player shortcuts while it is open (sliders keep their native keys).
  useEffect(() => {
    if (!open) return;
    // Space is play/pause here, but a focused control (an up-next row, the
    // collapse button, ...) also activates on Space keyup — so one keystroke
    // would both toggle and re-trigger that control. Swallow the click that
    // follows a Space toggle, keeping one keystroke = one action.
    let spaceAt = 0;
    const onClickCapture = (event: MouseEvent) => {
      if (Date.now() - spaceAt > 400) return;
      event.preventDefault();
      event.stopPropagation();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      const target = e.target as HTMLElement | null;
      const editing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (editing) return;

      const player = usePlayerStore.getState();
      switch (e.code) {
        case "Space":
          e.preventDefault(); // also stops the page from scrolling
          spaceAt = Date.now();
          player.toggle();
          break;
        case "ArrowRight":
          e.preventDefault();
          seekBy(SLIDE_SECONDS);
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekBy(-SLIDE_SECONDS);
          break;
        case "KeyM":
          player.toggleMute();
          break;
        case "KeyV":
          chooseVariant(variant === "bars" ? "wave" : "bars");
          break;
        default:
          break;
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClickCapture, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClickCapture, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose, variant]);

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
            className="relative mx-auto max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line bg-surface px-5 pb-[calc(2rem+var(--safe-b))] pt-3 shadow-2xl"
          >
            {/* Drag handle */}
            <div aria-hidden className="mx-auto mb-2 h-1.5 w-12 rounded-pill bg-line" />

            <div className="mb-4 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted">
                Now playing
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => chooseVariant(variant === "bars" ? "wave" : "bars")}
                  ariaLabel={variant === "bars" ? "Show waveform" : "Show spectrum bars"}
                  aria-pressed={variant === "wave"}
                  data-testid="visualizer-toggle"
                >
                  {variant === "bars" ? (
                    <Activity className="h-5 w-5" aria-hidden />
                  ) : (
                    <AudioLines className="h-5 w-5" aria-hidden />
                  )}
                </Button>
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
            </div>

            {/* Artwork */}
            <div className="relative mx-auto mb-5 h-52 w-52">
              {/* Bass-driven bloom behind the cover — opacity/scale come from the
                  analyser level, so it moves with the music, not on a timer. */}
              <div
                ref={glowRef}
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-3xl bg-accent blur-2xl"
                style={{ opacity: 0.15 }}
              />
              <div className="relative h-52 w-52 overflow-hidden rounded-3xl bg-surface-2 shadow-lg">
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

            {/* Live spectrum. Drawn only from real analyser data: when there is no
                signal path (non-CORS media, no Web Audio) it shows a flat
                baseline instead of inventing movement. */}
            <Visualizer
              active={isPlaying}
              variant={variant}
              bars={28}
              height={72}
              mirror
              peaks
              className="mt-5 w-full"
              onLevel={handleLevel}
            />

            {/* Seek */}
            <div className="mt-5 flex items-center gap-3">
              <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted">
                {formatDuration(dragging ? dragValue : position)}
              </span>
              {/* Custom seek bar */}
              <div
                ref={seekBarRef}
                role="slider"
                aria-label="Seek"
                aria-valuemin={0}
                aria-valuemax={total || 1}
                aria-valuenow={Math.round(dragging ? dragValue : position)}
                tabIndex={total > 0 ? 0 : -1}
                className={`relative h-6 flex-1 flex items-center cursor-pointer group ${total <= 0 ? "opacity-40 pointer-events-none" : ""}`}
                onPointerDown={(e) => {
                  if (total <= 0) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDragging(true);
                  setDragValue(getSeekValue(e.clientX));
                }}
                onPointerMove={(e) => {
                  if (!dragging) return;
                  setDragValue(getSeekValue(e.clientX));
                }}
                onPointerUp={(e) => {
                  if (!dragging) return;
                  const v = getSeekValue(e.clientX);
                  setDragging(false);
                  seekTo(v);
                }}
                onPointerCancel={() => setDragging(false)}
                onKeyDown={(e) => {
                  if (!total) return;
                  const step = e.shiftKey ? 30 : 10;
                  if (e.key === "ArrowRight") { e.preventDefault(); seekTo(Math.min(total, position + step)); }
                  if (e.key === "ArrowLeft")  { e.preventDefault(); seekTo(Math.max(0, position - step)); }
                }}
              >
                {/* Track */}
                <div className="absolute inset-x-0 h-1.5 rounded-full bg-line/60" />
                {/* Fill */}
                <div
                  className="absolute left-0 h-1.5 rounded-full bg-accent transition-[width] duration-75 ease-linear"
                  style={{ width: `${total > 0 ? Math.min(1, (dragging ? dragValue : position) / total) * 100 : 0}%` }}
                />
                {/* Thumb */}
                <div
                  className="absolute h-4 w-4 rounded-full bg-accent shadow-md transition-transform duration-75 group-hover:scale-125 group-active:scale-110"
                  style={{ left: `calc(${total > 0 ? Math.min(1, (dragging ? dragValue : position) / total) * 100 : 0}% - 8px)` }}
                />
              </div>
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

            {/* Up next */}
            {upNext.length > 0 && (
              <section className="mt-6" aria-label="Up next">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted">
                    Up next
                  </p>
                  <span className="text-[11px] text-muted">
                    {queue.length - currentIndex - 1 > 0
                      ? `${queue.length - currentIndex - 1} after this`
                      : `${queue.length} in queue`}
                  </span>
                </div>
                <ul className="space-y-0.5">
                  {upNext.map(({ song: item, position: positionInQueue }) => (
                    <li key={`${item.id}-${positionInQueue}`}>
                      <button
                        type="button"
                        data-testid="up-next-item"
                        onClick={() => usePlayerStore.getState().playSong(item, queue)}
                        className="flex w-full items-center gap-3 rounded-card px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
                      >
                        <span className="w-4 shrink-0 text-[11px] tabular-nums text-muted">
                          {positionInQueue}
                        </span>
                        <span className="h-9 w-9 shrink-0 overflow-hidden rounded-card bg-surface-2">
                          {item.cover_url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- dynamic signed URL
                            <img
                              src={resolveMediaUrl(item.cover_url) ?? undefined}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span
                              className="flex h-full w-full items-center justify-center text-accent"
                              aria-hidden
                            >
                              <Music4 className="h-4 w-4" />
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{item.title}</span>
                          {item.artist_name && (
                            <span className="block truncate text-xs text-muted">{item.artist_name}</span>
                          )}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted">
                          {formatDuration(item.duration_sec)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Shortcuts, discoverable without a manual */}
            <p className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-muted">
              <kbd className="rounded border border-line px-1.5 py-0.5">Space</kbd>
              <span>play/pause</span>
              <span aria-hidden>·</span>
              <kbd className="rounded border border-line px-1.5 py-0.5">←/→</kbd>
              <span>{SLIDE_SECONDS}s</span>
              <span aria-hidden>·</span>
              <kbd className="rounded border border-line px-1.5 py-0.5">M</kbd>
              <span>mute</span>
              <span aria-hidden>·</span>
              <kbd className="rounded border border-line px-1.5 py-0.5">V</kbd>
              <span>visualizer</span>
            </p>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

