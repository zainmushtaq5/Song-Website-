"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "@/hooks/use-reduced-motion";

/**
 * three.js is loaded only here, only on the homepage, and only for the devices
 * that get the 3D tier: a phone never downloads it, and no other route in the
 * app references it (proved in e2e/hero3d-screens.mjs by diffing the chunks a
 * route requests).
 */
const HeroScene = dynamic(() => import("@/components/home/hero-scene"), { ssr: false });

type Tier = "none" | "lite" | "full";

/** Everything below the desktop breakpoint keeps the gradient hero only. */
const FULL_QUERY = "(min-width: 1024px)";
const LITE_QUERY = "(min-width: 768px)";

function detectTier(): Tier {
  if (typeof window === "undefined") return "none";
  // A WebGL context is non-negotiable for the 3D tier; skip the download if the
  // device cannot create one (old hardware, blocklisted drivers, headless CI).
  const probe = document.createElement("canvas");
  const gl =
    probe.getContext("webgl2") ??
    probe.getContext("webgl") ??
    probe.getContext("experimental-webgl");
  if (!gl) return "none";
  if (window.matchMedia(FULL_QUERY).matches) return "full";
  if (window.matchMedia(LITE_QUERY).matches) return "lite";
  return "none";
}

/** Resolve a design token to a colour string three.js can parse. */
function tokenToRgb(variable: string, fallback: string): string {
  try {
    const probe = document.createElement("span");
    probe.style.color = `var(${variable})`;
    probe.style.display = "none";
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    // Tokens are oklch(...), which three cannot parse — round-trip via canvas.
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return fallback;
    ctx.fillStyle = computed;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${r}, ${g}, ${b})`;
  } catch {
    return fallback;
  }
}

const FALLBACK_ACCENT = "#b18cff";
const FALLBACK_STRONG = "#d6c3ff";

/**
 * Fade mask per tier. Tablet keeps the soft ring of the scene further down the
 * card (see the group transform in hero-scene.tsx), so its mask centre follows
 * it; desktop centres the fade on the ring that sits beside the copy.
 */
const MASK: Record<Tier, string> = {
  none: "[mask-image:none]",
  lite: "[mask-image:radial-gradient(ellipse_at_50%_74%,black_52%,transparent_88%)]",
  full: "[mask-image:radial-gradient(ellipse_at_58%_50%,black_42%,transparent_76%)]",
};

const waveBars = [14, 26, 40, 62, 88, 72, 96, 54, 78, 46, 30, 58, 84, 40, 20, 48, 68, 34, 22, 12];

/**
 * Hero backdrop: the gradient layers live in `hero.tsx`; this adds the optional
 * 3D layer and keeps its cost honest —
 *   · tier: phones ("none") never load the bundle, tablets get "lite"
 *     (fewer bars/particles, lower dpr, 30fps cap), desktop gets "full"
 *   · rendering stops while the hero is off-screen or the tab is hidden
 *   · prefers-reduced-motion renders a single static frame, no animation loop
 */
export function HeroBackdrop() {
  const reduced = useReducedMotion();
  const holderRef = useRef<HTMLDivElement | null>(null);
  const [tier, setTier] = useState<Tier>("none");
  const [active, setActive] = useState(false);
  const [palette, setPalette] = useState({ accent: FALLBACK_ACCENT, strong: FALLBACK_STRONG });

  // Tier follows the viewport (and survives resizes between the two 3D tiers).
  useEffect(() => {
    const sync = () => setTier(detectTier());
    sync();
    const queries = [window.matchMedia(FULL_QUERY), window.matchMedia(LITE_QUERY)];
    for (const query of queries) query.addEventListener("change", sync);
    return () => {
      for (const query of queries) query.removeEventListener("change", sync);
    };
  }, []);

  // Palette comes from the CSS tokens so the scene cannot drift from the theme.
  useEffect(() => {
    if (tier === "none") return;
    setPalette({
      accent: tokenToRgb("--color-accent", FALLBACK_ACCENT),
      strong: tokenToRgb("--color-accent-strong", FALLBACK_STRONG),
    });
  }, [tier]);

  // Render only while the hero is on screen and the tab is visible.
  useEffect(() => {
    if (tier === "none") return;
    const holder = holderRef.current;
    if (!holder) return;

    const sync = () => {
      setActive(!document.hidden && holder.dataset.intersecting !== "false");
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) holder.dataset.intersecting = String(entry.isIntersecting);
        sync();
      },
      { threshold: 0.01 },
    );
    observer.observe(holder);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [tier]);

  return (
    <>
      <div
        ref={holderRef}
        data-hero-tier={tier}
        data-hero-active={active}
        data-hero-reduced={reduced}
        className={`pointer-events-none absolute inset-0 ${MASK[tier]}`}
        aria-hidden
      >
        {/* Decorative waveform: shown until (and unless) the 3D layer takes over. */}
        <svg
          aria-hidden
          role="presentation"
          width="340"
          height="170"
          viewBox="0 0 340 170"
          className={`absolute right-10 top-1/2 -translate-y-1/2 ${tier === "none" ? "" : "hidden"} opacity-40 lg:block`}
        >
          {waveBars.map((h, i) => (
            <rect
              key={i}
              x={i * 17}
              y={(170 - h * 1.6) / 2}
              width="7"
              height={h * 1.6}
              rx="3.5"
              className="fill-accent"
              opacity={0.15 + (h / 96) * 0.5}
            />
          ))}
        </svg>

        {tier !== "none" && (
          <HeroScene
            tier={tier}
            active={active}
            reduced={reduced}
            accent={palette.accent}
            accentStrong={palette.strong}
          />
        )}
      </div>

      {/*
        Tablet only: the copy there spans the full card width, so the scene gets
        a top-down scrim on top of it. Sits after the holder, which also keeps it
        clear of the holder's fade mask.
      */}
      {tier === "lite" && (
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-bg via-bg/60 to-transparent" />
      )}
    </>
  );
}
