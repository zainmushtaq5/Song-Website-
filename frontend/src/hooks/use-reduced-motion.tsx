"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onStoreChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

/** Cheap, stable read — booleans compare by value so no caching is needed. */
function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

/** Hydration renders the motion-enabled markup so it matches the SSR HTML. */
function getServerSnapshot() {
  return false;
}

/**
 * SSR-safe read of prefers-reduced-motion (live-updates when it changes).
 *
 * Hydration always renders the non-reduced markup — identical to what the server
 * sent — and React then re-renders with the real preference in a normal update.
 * That ordering matters: if the reduced branch rendered *during* hydration the
 * server-rendered `initial` inline styles (e.g. `opacity:0`) would survive
 * hydration, leaving sections permanently invisible for reduced-motion users.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Shared easing for scroll reveals. */
export const EASE = [0.22, 1, 0.36, 1] as const;
