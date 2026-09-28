"use client";

/**
 * Web Audio tap for the single shared <audio> element.
 *
 * Three constraints shape this module:
 *  1. A media element can be routed into Web Audio only ONCE, ever — a second
 *     `createMediaElementSource()` throws. Attaches are therefore guarded per
 *     element and the graph is built at most once.
 *  2. Once attached, the element's output leaves through the graph only. The
 *     analyser must be connected to `ctx.destination` or playback goes silent.
 *  3. Cross-origin media that is not CORS-enabled renders as *silence* in the
 *     graph, and there is no way back (the element cannot be detached), so the
 *     player probes CORS access first and simply never attaches for a source
 *     that would be tainted. See `lib/media-cors.ts`.
 *
 * The module is a tiny observable store so React can read the status with
 * `useSyncExternalStore` without prop drilling from the player.
 */

export type VisualizerStatus = "idle" | "ready" | "unavailable";

export interface AnalyserStatus {
  status: VisualizerStatus;
  /** Machine-readable cause when `status === "unavailable"`. */
  reason: string | null;
}

export const ANALYSER_FFT_SIZE = 2048;
export const ANALYSER_BINS = ANALYSER_FFT_SIZE / 2;

const IDLE: AnalyserStatus = { status: "idle", reason: null };

let snapshot: AnalyserStatus = IDLE;
const listeners = new Set<() => void>();

let context: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
/** Elements already routed into the graph (or rejected) — attach is once-only. */
const touched = new WeakSet<HTMLMediaElement>();

function emit(next: AnalyserStatus) {
  if (next.status === snapshot.status && next.reason === snapshot.reason) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

export function subscribeAnalyser(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAnalyserStatus(): AnalyserStatus {
  return snapshot;
}

/** Stable value for SSR/hydration: never claim availability before a real attach. */
export function getServerAnalyserStatus(): AnalyserStatus {
  return IDLE;
}

function AudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Route `element` through an analyser into the speakers.
 * Returns true when the graph is live. Safe to call repeatedly; only the first
 * call for a given element does anything.
 */
export function attachAnalyser(element: HTMLMediaElement): boolean {
  if (touched.has(element)) return analyser !== null;
  touched.add(element);

  const Ctor = AudioContextCtor();
  if (!Ctor) {
    emit({ status: "unavailable", reason: "no-web-audio" });
    return false;
  }

  try {
    const ctx = context ?? new Ctor();
    const node = analyser ?? ctx.createAnalyser();
    node.fftSize = ANALYSER_FFT_SIZE;
    // Rolling average keeps the bars from strobing at frame rate.
    node.smoothingTimeConstant = 0.8;
    // Explicit dynamic range. The default maxDecibels of -30dB saturates every
    // loud bin to 255, which paints a brick wall instead of a spectrum.
    node.minDecibels = -90;
    node.maxDecibels = -5;

    // Throws for a tainted source; nothing has been connected yet in that case,
    // so the element keeps playing natively.
    const source = ctx.createMediaElementSource(element);
    source.connect(node);
    node.connect(ctx.destination);

    context = ctx;
    analyser = node;
    emit({ status: "ready", reason: null });
    return true;
  } catch (error) {
    emit({ status: "unavailable", reason: error instanceof Error ? error.name : "attach-failed" });
    return false;
  }
}

/** The player could not use a CORS-clean source, so there is no signal to read. */
export function markAnalyserUnavailable(reason: string): void {
  emit({ status: "unavailable", reason });
}

/** Browsers park a fresh AudioContext until a gesture; call this when playing. */
export function resumeAnalyser(): void {
  if (context && context.state === "suspended") void context.resume().catch(() => {});
}

export function getAnalyserContextState(): AudioContextState | null {
  return context?.state ?? null;
}

/**
 * True once our element is routed through the graph. A tainted (non-CORS)
 * source would render as silence there and cannot be un-routed, so the player
 * must not "fall back" to a non-CORS load after this point.
 */
export function isAnalyserAttached(): boolean {
  return analyser !== null;
}

/** Frequency bins in Hz — needed to place log-scaled bars. */
export function getBinHz(): number {
  return context && analyser ? context.sampleRate / analyser.fftSize : 0;
}

/**
 * Fill `target` with the current spectrum (0..255 per bin).
 * Returns false when there is no live analyser, so callers can fall back.
 */
export function readSpectrum(target: Uint8Array): boolean {
  if (!analyser || analyser.frequencyBinCount < target.length) return false;
  analyser.getByteFrequencyData(target);
  return true;
}

/** Fill `target` with the current waveform (0..255 around 128). */
export function readWaveform(target: Uint8Array): boolean {
  if (!analyser) return false;
  analyser.getByteTimeDomainData(target);
  return true;
}
