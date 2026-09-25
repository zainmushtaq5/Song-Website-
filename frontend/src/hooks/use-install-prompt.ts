"use client";

import { useSyncExternalStore } from "react";

/** Minimal shape of Chromium's `beforeinstallprompt` event (not in lib.dom yet). */
export interface InstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt: () => Promise<void>;
}

export interface InstallPromptState {
  /** Chromium/Edge captured a `beforeinstallprompt` event → we can show a native prompt. */
  canInstall: boolean;
  /** iOS Safari never fires the event; the user needs manual "Add to Home Screen" steps. */
  needsManualInstall: boolean;
  /** Already running as an installed app (or just installed in this session). */
  isStandalone: boolean;
  /** User chose "Not now" — suppressed for DISMISS_MS. */
  dismissed: boolean;
}

const DISMISS_KEY = "songs.pwa.install-dismissed";
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000; // two weeks
const STANDALONE_QUERY = "(display-mode: standalone)";

/** Server/first-render state: nothing is installable until the browser says so. */
const INITIAL: InstallPromptState = {
  canInstall: false,
  needsManualInstall: false,
  isStandalone: false,
  dismissed: false,
};

let deferredEvent: InstallPromptEvent | null = null;
let installedThisSession = false;
/** Cached snapshot — `useSyncExternalStore` requires a stable reference. */
let snapshot: InstallPromptState = INITIAL;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function readDismissed(): boolean {
  try {
    return Number(localStorage.getItem(DISMISS_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

function detectManualInstall(): boolean {
  const ua = navigator.userAgent;
  // iOS/iPadOS Safari (and other iOS browsers, which all use WebKit) have no prompt API.
  const isIosWebKit = /iphone|ipad|ipod/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
  return isIosWebKit;
}

function detectStandalone(): boolean {
  if (installedThisSession) return true;
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia(STANDALONE_QUERY).matches || legacy === true;
}

function refresh() {
  const next: InstallPromptState = {
    canInstall: deferredEvent !== null,
    needsManualInstall: detectManualInstall(),
    isStandalone: detectStandalone(),
    dismissed: readDismissed(),
  };
  if (
    next.canInstall === snapshot.canInstall &&
    next.needsManualInstall === snapshot.needsManualInstall &&
    next.isStandalone === snapshot.isStandalone &&
    next.dismissed === snapshot.dismissed
  ) {
    return;
  }
  snapshot = next;
  emit();
}

// Capture as early as possible: Chromium fires `beforeinstallprompt` once per page
// load, so the listeners are registered at module scope (guarded for SSR).
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // keep the event so *our* button can trigger the prompt
    deferredEvent = event as InstallPromptEvent;
    refresh();
  });
  window.addEventListener("appinstalled", () => {
    deferredEvent = null;
    installedThisSession = true;
    try {
      localStorage.removeItem(DISMISS_KEY);
    } catch {
      /* storage unavailable (private mode) — nothing to clean up */
    }
    refresh();
  });
  window.matchMedia(STANDALONE_QUERY).addEventListener("change", refresh);
  refresh();
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return INITIAL;
}

/** Shows the native install prompt. Resolves `unavailable` when nothing was captured. */
export async function requestInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferredEvent) return "unavailable";
  const event = deferredEvent;
  deferredEvent = null; // the event can only be used once
  refresh();
  let outcome: "accepted" | "dismissed" = "dismissed";
  try {
    await event.prompt();
    ({ outcome } = await event.userChoice);
  } catch {
    return "unavailable";
  }
  if (outcome === "accepted") {
    installedThisSession = true;
  } else {
    dismissInstall();
  }
  refresh();
  return outcome;
}

/** "Not now" — survives reloads for DISMISS_MS, then the banner is allowed back. */
export function dismissInstall() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS));
  } catch {
    /* storage unavailable — the banner simply comes back next visit */
  }
  refresh();
}

export function useInstallPrompt(): InstallPromptState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** True when there is an install path *and* the user has not dismissed it. */
export function shouldOfferInstall(state: InstallPromptState): boolean {
  return !state.isStandalone && !state.dismissed && (state.canInstall || state.needsManualInstall);
}
