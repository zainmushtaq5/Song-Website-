"use client";

import { useEffect } from "react";

import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";

const STANDALONE_QUERY = "(display-mode: standalone)";

/**
 * Client-side PWA bootstrap: registers the offline worker and mirrors the current
 * display mode onto `<html data-display-mode="…">`, which the shell styles use to
 * tighten chrome when the site runs from a home-screen icon.
 */
export function PwaProvider() {
  useEffect(() => {
    const mq = window.matchMedia(STANDALONE_QUERY);
    const sync = () => {
      document.documentElement.dataset.displayMode = mq.matches ? "standalone" : "browser";
    };
    sync();
    mq.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      delete document.documentElement.dataset.displayMode;
    };
  }, []);

  return <ServiceWorkerRegistrar />;
}
