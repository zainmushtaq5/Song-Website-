import type { Metadata } from "next";
import Link from "next/link";
import { Check, Music2, WifiOff, X } from "lucide-react";

import { RetryButton } from "@/components/pwa/retry-button";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Offline",
  description: "You are offline — cached pages and downloaded files still work.",
};

const AVAILABLE = [
  "Pages you already opened in this session",
  "Files you downloaded to your device",
  "Your installed app shell and icons",
];

const UNAVAILABLE = ["New searches and artist pages", "Streaming playback and uploads", "Likes, playlists and anything that saves"];

/**
 * Offline fallback document, precached by `public/sw.js` at install time.
 *
 * Intentionally static and dependency-light so it renders from cache on any route
 * that was never visited while online.
 */
export default function OfflinePage() {
  return (
    <main
      data-testid="offline-shell"
      className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-5 py-14 sm:px-8"
    >
      <div className="flex items-center gap-2 font-bold tracking-tight">
        <span className="flex h-8 w-8 items-center justify-center rounded-card bg-accent text-white">
          <Music2 className="h-4 w-4" aria-hidden />
        </span>
        <span>Songs</span>
      </div>

      <span className="mt-10 flex h-12 w-12 items-center justify-center rounded-card bg-surface-2 text-accent" aria-hidden>
        <WifiOff className="h-5 w-5" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">You&rsquo;re offline</h1>
      <p className="mt-2 max-w-prose text-sm text-muted">
        This page isn&rsquo;t in the offline cache yet. Reconnect to keep browsing, or jump back to
        something you already opened.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <RetryButton />
        <Button href="/library" variant="secondary">
          Open my library
        </Button>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <section className="rounded-card border border-line bg-surface/60 p-4">
          <h2 className="text-sm font-semibold">Still available</h2>
          <ul className="mt-3 space-y-2 text-xs text-muted">
            {AVAILABLE.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-card border border-line bg-surface/60 p-4">
          <h2 className="text-sm font-semibold">Needs a connection</h2>
          <ul className="mt-3 space-y-2 text-xs text-muted">
            {UNAVAILABLE.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <p className="mt-8 text-xs text-muted">
        Songs works offline as a browsable shell — full offline playback isn&rsquo;t part of this build.{" "}
        <Link href="/" className="text-accent underline-offset-4 hover:underline">
          Back to Discover
        </Link>
      </p>
    </main>
  );
}
