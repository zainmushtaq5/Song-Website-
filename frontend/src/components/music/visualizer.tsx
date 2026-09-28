"use client";

import { useCallback, useEffect, useRef } from "react";

import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useVisualizer, type VisualizerMode } from "@/hooks/use-visualizer";

export type VisualizerVariant = "bars" | "wave";

interface VisualizerProps {
  /** Audio is playing. */
  active: boolean;
  variant?: VisualizerVariant;
  /** Bands drawn in "bars" mode. */
  bars?: number;
  /** CSS height in px (the parent controls width). */
  height?: number;
  /** Bars grow from the centre line instead of the floor. */
  mirror?: boolean;
  /** Peak-hold caps that drift down after each hit. */
  peaks?: boolean;
  className?: string;
  /** Smoothed bass energy 0..1, for glow/pulse effects owned by the caller. */
  onLevel?: (level: number) => void;
}

/** Used only if the theme variables cannot be read (e.g. canvas without CSS). */
const FALLBACK_ACCENT = "#b18cff";
const FALLBACK_ACCENT_STRONG = "#d6c3ff";

/** The top of the spectrum is mostly empty for lossy audio — fold it away. */
const USABLE_SPECTRUM = 0.72;

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/**
 * Spectrum bars / oscilloscope for the now-playing surfaces.
 *
 * Decorative by design (`aria-hidden`): everything it shows is already available
 * as text, and the wrapper carries `data-visualizer-mode` so "live, static or
 * unavailable" is inspectable instead of guessed at.
 *
 * Reduced motion draws exactly one real frame — no animation loop.
 */
export function Visualizer({
  active,
  variant = "bars",
  bars = 48,
  height = 72,
  mirror = false,
  peaks = false,
  className = "",
  onLevel,
}: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const lastRef = useRef<{ freq: Uint8Array; wave: Uint8Array } | null>(null);
  const bandsRef = useRef<Float32Array>(new Float32Array(bars));
  const peaksRef = useRef<Float32Array>(new Float32Array(bars));
  const theme = useRef({ accent: FALLBACK_ACCENT, strong: FALLBACK_ACCENT_STRONG });
  const reduced = useReducedMotion();

  const paintBars = useCallback(
    (values: Float32Array) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const { w, h, dpr } = sizeRef.current;
      if (!canvas || !ctx || w === 0 || h === 0) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const n = values.length;
      const gap = Math.max(1, w * 0.008);
      const barW = Math.max(1, (w - gap * (n - 1)) / n);
      const radius = Math.min(barW / 2, 3);
      const floor = mirror ? 1.2 : 2;
      const centre = h / 2;

      const gradient = ctx.createLinearGradient(0, mirror ? 0 : h, 0, mirror ? h : 0);
      gradient.addColorStop(0, theme.current.accent);
      gradient.addColorStop(mirror ? 0.5 : 1, theme.current.strong);
      ctx.fillStyle = gradient;

      for (let i = 0; i < n; i++) {
        const x = i * (barW + gap);
        const scaled = values[i] ?? 0;
        if (mirror) {
          const half = Math.max(floor, (h / 2 - 2) * scaled);
          roundRect(ctx, x, centre - half, barW, half * 2, radius);
          ctx.fill();
        } else {
          const barH = Math.max(floor, (h - 2) * scaled);
          roundRect(ctx, x, h - barH, barW, barH, radius);
          ctx.fill();
        }

        if (!peaks) continue;
        const previous = peaksRef.current[i] ?? 0;
        const next = scaled > previous ? scaled : Math.max(0, previous - 0.02);
        peaksRef.current[i] = next;
        if (next <= 0.03) continue;
        const capY = mirror
          ? centre - Math.max(floor, (h / 2 - 2) * next) - 2
          : h - Math.max(floor, (h - 2) * next) - 3;
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = theme.current.strong;
        roundRect(ctx, x, capY, barW, 2, 1);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    },
    [mirror, peaks],
  );

  const paintWave = useCallback((wave: Uint8Array) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const { w, h, dpr } = sizeRef.current;
    if (!canvas || !ctx || w === 0 || h === 0) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const step = Math.max(1, Math.floor(wave.length / (w * 2)));
    const amp = (h / 2) * 0.86;
    // Two passes (bloom + core) read as a glowing trace without shadowBlur.
    const trace = (width: number, alpha: number, colour: string) => {
      ctx.beginPath();
      for (let x = 0, i = 0; x <= w; x += 1, i += step) {
        const sample = ((wave[Math.min(i, wave.length - 1)] ?? 128) - 128) / 128;
        const y = h / 2 + sample * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineWidth = width;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = colour;
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    trace(4, 0.22, theme.current.accent);
    trace(1.6, 1, theme.current.strong);
  }, []);

  /** Flat, honest resting frame for paused / unavailable states. */
  const paintResting = useCallback(
    (state: VisualizerMode) => {
      if (variant === "bars") {
        ctxAlphaThen(canvasRef.current, state === "unavailable" ? 0.22 : 0.4, () =>
          paintBars(bandsRef.current.fill(0)),
        );
        return;
      }
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const { w, h, dpr } = sizeRef.current;
      if (!canvas || !ctx || w === 0 || h === 0) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = state === "unavailable" ? 0.18 : 0.3;
      ctx.strokeStyle = state === "unavailable" ? theme.current.accent : theme.current.strong;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
    [paintBars, variant],
  );

  const drawLive = useCallback(
    (freq: Uint8Array, wave: Uint8Array) => {
      lastRef.current = { freq, wave };
      if (variant === "wave") {
        paintWave(wave);
        return;
      }
      // Log-spaced bands: linear bins would spend most of the canvas on treble.
      const bands = bandsRef.current;
      const maxBin = Math.max(2, Math.floor(freq.length * USABLE_SPECTRUM));
      for (let i = 0; i < bands.length; i++) {
        const from = Math.round(Math.pow(maxBin, i / bands.length));
        const to = Math.max(from + 1, Math.round(Math.pow(maxBin, (i + 1) / bands.length)));
        let peak = 0;
        for (let b = from; b < to && b < freq.length; b++) {
          const value = freq[b] ?? 0;
          if (value > peak) peak = value;
        }
        bands[i] = Math.pow(peak / 255, 0.85);
      }
      paintBars(bands);
    },
    [paintBars, paintWave, variant],
  );

  const { mode } = useVisualizer({
    active,
    reduced,
    onFrame: (freq, wave) => {
      drawLive(freq, wave); // also records the buffers for resize repaints
    },
    onLevel,
  });

  // Size the backing store to the device pixel ratio and (re)paint on resize.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w === 0 || h === 0) return;
      sizeRef.current = { w, h, dpr };
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const styles = getComputedStyle(canvas);
      theme.current = {
        accent: styles.getPropertyValue("--color-accent").trim() || FALLBACK_ACCENT,
        strong: styles.getPropertyValue("--color-accent-strong").trim() || FALLBACK_ACCENT_STRONG,
      };
      const last = lastRef.current;
      if (last && active) drawLive(last.freq, last.wave);
      else paintResting(mode);
    };

    resize();
    const observer = new ResizeObserver(resize);
    if (parent) observer.observe(parent);
    return () => observer.disconnect();
  }, [active, drawLive, mode, paintResting]);

  // Paused / unavailable: nothing streams in, so draw the resting frame once.
  useEffect(() => {
    if (mode === "idle" || mode === "unavailable") paintResting(mode);
  }, [mode, paintResting]);

  return (
    <div
      data-visualizer-mode={mode}
      data-visualizer-variant={variant}
      className={className}
      style={{ height }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

/** Run a paint callback at a fixed alpha, restoring it afterwards. */
function ctxAlphaThen(canvas: HTMLCanvasElement | null, alpha: number, paint: () => void): void {
  const ctx = canvas?.getContext("2d");
  if (!ctx) return;
  ctx.globalAlpha = alpha;
  paint();
  ctx.globalAlpha = 1;
}
