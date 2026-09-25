"use client";

import { useSyncExternalStore } from "react";

function subscribe(onStoreChange: () => void) {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

/** Cheap, stable read — booleans compare by value so no caching is needed. */
function getSnapshot() {
  return navigator.onLine;
}

/** Hydration renders the online state so it matches the server HTML. */
function getServerSnapshot() {
  return true;
}

/** Live `navigator.onLine` state, SSR-safe (see use-reduced-motion for the rationale). */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
