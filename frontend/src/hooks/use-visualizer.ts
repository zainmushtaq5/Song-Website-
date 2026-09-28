"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  ANALYSER_BINS,
  ANALYSER_FFT_SIZE,
  getAnalyserStatus,
  getServerAnalyserStatus,
  readSpectrum,
  readWaveform,
  resumeAnalyser,
  subscribeAnalyser,
} from "@/lib/audio-analyser";

/**
 * `live`        — spectrum is arriving and being drawn every frame
 * `static`      — reduced motion: a single frame is drawn, never animated
 * `idle`        — paused (nothing to animate)
 * `no-signal`   — playing, but the source decodes to silence (no fake bars)
 * `unavailable` — Web Audio could not be used (no API / non-CORS media)
 */
export type VisualizerMode = "live" | "static" | "idle" | "no-signal" | "unavailable";

/** ~2s at 60fps of consecutive silent frames before we call it no-signal. */
const SILENT_FRAMES = 120;
/** Above this peak bin value the frame counts as "there is audio here". */
const SIGNAL_FLOOR = 2;

interface UseVisualizerOptions {
  /** Audio is actually playing. */
  active: boolean;
  /** prefers-reduced-motion is set. */
  reduced: boolean;
  /** Called every frame with the fresh buffers — draw here, not in an effect. */
  onFrame?: (freq: Uint8Array, wave: Uint8Array, level: number) => void;
  /** Smoothed bass energy (0..1), for non-canvas effects such as the glow. */
  onLevel?: (level: number) => void;
}

export interface VisualizerData {
  mode: VisualizerMode;
  /** Spectrum, 0..255 per bin — written in place, never re-allocated. */
  freqRef: React.RefObject<Uint8Array>;
  /** Waveform, 0..255 centred on 128. */
  waveRef: React.RefObject<Uint8Array>;
  /** Smoothed 0..1 energy, for non-canvas effects. */
  levelRef: React.RefObject<number>;
  /** Frames drawn — increments make "is it animating?" observable. */
  framesRef: React.RefObject<number>;
}

/**
 * Drives the canvas renderers from the shared analyser.
 *
 * Kept deliberately out of React state: spectrum data changes 60x/s and any
 * re-render per frame would be far more expensive than the drawing itself. Only
 * rare `mode` transitions (play/pause/silence) go through state.
 */
export function useVisualizer({ active, reduced, onFrame, onLevel }: UseVisualizerOptions): VisualizerData {
  const status = useSyncExternalStore(subscribeAnalyser, getAnalyserStatus, getServerAnalyserStatus);
  const freqRef = useRef(new Uint8Array(ANALYSER_BINS));
  const waveRef = useRef(new Uint8Array(ANALYSER_FFT_SIZE));
  const levelRef = useRef(0);
  const framesRef = useRef(0);
  const onFrameRef = useRef(onFrame);
  const onLevelRef = useRef(onLevel);
  onFrameRef.current = onFrame;
  onLevelRef.current = onLevel;

  const [mode, setMode] = useState<VisualizerMode>("idle");

  useEffect(() => {
    if (status.status === "unavailable") {
      setMode("unavailable");
      return;
    }
    if (!active) {
      levelRef.current = 0;
      setMode("idle");
      return;
    }
    // A fresh play should not inherit the previous track's silence verdict.
    let silentFrames = 0;

    if (reduced) {
      // One snapshot, then stop: no loop, no motion.
      readSpectrum(freqRef.current);
      readWaveform(waveRef.current);
      framesRef.current += 1;
      onFrameRef.current?.(freqRef.current, waveRef.current, levelRef.current);
      setMode("static");
      return;
    }

    let raf = 0;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      resumeAnalyser();
      const hasSpectrum = readSpectrum(freqRef.current);
      readWaveform(waveRef.current);

      const bins = freqRef.current;
      let peak = 0;
      // The low third carries the bass that drives the glow.
      let bass = 0;
      const bassBins = Math.max(1, Math.floor(bins.length / 3));
      for (let i = 0; i < bins.length; i++) {
        const value = bins[i] ?? 0;
        if (value > peak) peak = value;
        if (i < bassBins) bass += value;
      }
      const energy = bass / (bassBins * 255);

      // Fast attack, slow release — reads as a pulse instead of a flicker.
      const previous = levelRef.current;
      levelRef.current = energy > previous ? energy : previous * 0.86 + energy * 0.14;

      if (hasSpectrum && peak > SIGNAL_FLOOR) silentFrames = 0;
      else silentFrames += 1;

      framesRef.current += 1;
      onFrameRef.current?.(bins, waveRef.current, levelRef.current);
      onLevelRef.current?.(levelRef.current);
      setMode((current) => {
        const next: VisualizerMode = silentFrames > SILENT_FRAMES ? "no-signal" : "live";
        return current === next ? current : next;
      });

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [active, reduced, status.status]);

  return { mode, freqRef, waveRef, levelRef, framesRef };
}
