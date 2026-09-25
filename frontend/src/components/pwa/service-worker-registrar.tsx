"use client";

import { useEffect } from "react";

const SW_PATH = "/sw.js";

/**
 * Registers the offline shell worker (`public/sw.js`).
 *
 * Production only by default: a worker that caches `next dev` output serves stale
 * chunks and is confusing to develop against. Set `NEXT_PUBLIC_SW_DEV=1` to opt in.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const enabled = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_SW_DEV === "1";
    if (!enabled) return;

    let cancelled = false;
    // Only reload when an *upgrade* takes control — first-run activation must not loop.
    const hadController = Boolean(navigator.serviceWorker.controller);

    const onControllerChange = () => {
      if (hadController) window.location.reload();
    };

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
        if (cancelled) return;
        window.dispatchEvent(
          new CustomEvent("songs:sw-registered", { detail: { scope: registration.scope } }),
        );
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          // A new worker waiting in the background should take over promptly.
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              installing.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      } catch (error) {
        console.warn("[pwa] service worker registration failed", error);
      }
    };

    void register();
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
