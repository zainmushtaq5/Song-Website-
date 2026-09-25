"use client";

import { motion } from "motion/react";
import { Download, Share, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  dismissInstall,
  requestInstall,
  shouldOfferInstall,
  useInstallPrompt,
} from "@/hooks/use-install-prompt";
import { EASE, useReducedMotion } from "@/hooks/use-reduced-motion";

/** Sits above the fixed player bar + mobile nav (see app/(main)/layout.tsx). */
const BANNER_POSITION = "bottom-[calc(7.6rem+var(--safe-b))] sm:bottom-[5.25rem]";

/**
 * Install affordance with two modes:
 *  • Chromium/Edge — `beforeinstallprompt` was captured, so a real native prompt can
 *    be triggered from here.
 *  • iOS WebKit — no prompt API exists, so the manual Share → Add to Home Screen
 *    instructions are shown instead.
 * Renders nothing for already-installed users or while the "Not now" snooze is active.
 */
export function InstallPrompt() {
  const state = useInstallPrompt();
  const reduced = useReducedMotion();
  const [busy, setBusy] = useState(false);

  if (!shouldOfferInstall(state)) return null;

  const promptable = state.canInstall;

  return (
    <motion.div
      role="region"
      aria-label="Install Songs"
      data-testid="install-prompt"
      initial={reduced ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className={`fixed inset-x-3 z-[45] rounded-card border border-line bg-surface/95 p-3 shadow-xl backdrop-blur sm:inset-x-auto sm:right-4 sm:w-[22rem] ${BANNER_POSITION}`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-card bg-accent/15 text-accent"
        >
          {promptable ? <Download className="h-4 w-4" /> : <Share className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install Songs</p>
          {promptable ? (
            <p className="mt-0.5 text-xs text-muted">
              Full-screen player, home-screen icon and instant launch.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted">
              Tap <Share className="inline h-3 w-3 align-[-1px]" aria-hidden /> Share, then{" "}
              <span className="text-ink">Add to Home Screen</span>.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={dismissInstall}
          aria-label="Dismiss install banner"
          className="rounded-pill p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        {promptable && (
          <Button
            size="sm"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await requestInstall();
              setBusy(false);
            }}
          >
            Install
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={dismissInstall}>
          Not now
        </Button>
      </div>
    </motion.div>
  );
}

/**
 * Persistent desktop entry point (the banner is dismissible, this is not).
 * Invisible on small screens, where the banner is the affordance: the wrapper owns
 * the responsive display so it cannot be overridden by the shared Button classes.
 */
export function InstallAppButton() {
  const { canInstall, isStandalone } = useInstallPrompt();
  const [busy, setBusy] = useState(false);

  if (!canInstall || isStandalone) return null;

  return (
    <span className="hidden sm:inline-flex">
      <Button
        variant="ghost"
        size="sm"
        data-testid="install-app-button"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          await requestInstall();
          setBusy(false);
        }}
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        Install
      </Button>
    </span>
  );
}
