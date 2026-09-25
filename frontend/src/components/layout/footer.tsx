import Link from "next/link";
import { Music2 } from "lucide-react";

/* ── Column data ────────────────────────────────────────────── */

const platformLinks = [
  { label: "Discover", href: "/" },
  { label: "Trending", href: "/#feed" },
  { label: "Search", href: "/search" },
  { label: "Upload Music", href: "/upload" },
];

const legalLinks = [
  { label: "Terms of Service", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Copyright Policy", href: "/copyright" },
];

/* Social icons — using Lucide-compatible icons.
   Lucide doesn't ship brand icons for Twitter/Instagram/YouTube,
   so we render small inline SVGs that match the Lucide visual weight. */

function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 4l11.733 16h4.267l-11.733 -16z" />
      <path d="M4 20l6.768 -6.768m2.46 -2.46L20 4" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
    </svg>
  );
}

function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </svg>
  );
}

const socials = [
  { label: "Twitter", href: "#", Icon: TwitterIcon },
  { label: "Instagram", href: "#", Icon: InstagramIcon },
  { label: "YouTube", href: "#", Icon: YoutubeIcon },
];

/* ── Component ──────────────────────────────────────────────── */

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-line/60 sm:mt-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* ── Columns ─────────────────────────────────────── */}
        <div className="grid gap-10 py-12 sm:grid-cols-2 sm:py-16 lg:grid-cols-4">
          {/* Brand column */}
          <div className="lg:col-span-1">
            <Link
              href="/"
              className="inline-flex items-center gap-2 font-bold tracking-tight"
              aria-label="Songs home"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-card bg-accent text-white">
                <Music2 className="h-4.5 w-4.5" aria-hidden />
              </span>
              <span className="text-base">Songs</span>
            </Link>
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted">
              Discover, stream, and download music from independent and emerging
              artists — all in one place.
            </p>
          </div>

          {/* Platform column */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-ink">
              Platform
            </h3>
            <ul className="space-y-2">
              {platformLinks.map((l) => (
                <li key={l.href + l.label}>
                  <Link
                    href={l.href}
                    className="text-sm text-muted transition-colors duration-150 hover:text-ink"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal column */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-ink">
              Legal
            </h3>
            <ul className="space-y-2">
              {legalLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-muted transition-colors duration-150 hover:text-ink"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Connect column */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-ink">
              Connect
            </h3>
            <div className="flex gap-3">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  className="flex h-9 w-9 items-center justify-center rounded-card border border-line/60 text-muted transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:text-ink hover:shadow-md hover:shadow-accent/10"
                >
                  <s.Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Follow us for new artist spotlights, platform updates, and
              playlists.
            </p>
          </div>
        </div>

        {/* ── Bottom bar ──────────────────────────────────── */}
        {/* pb clears the fixed player + mobile nav (112px on mobile, ~68px desktop) + safe area */}
        <div className="flex flex-col items-center justify-between gap-2 border-t border-line/40 pb-[calc(7rem+var(--safe-b))] pt-5 text-[11px] text-muted sm:flex-row sm:pb-[calc(5rem+var(--safe-b))]">
          <p>© {year} Songs. All rights reserved.</p>
          <p>
            Made for independent musicians and the people who listen.
          </p>
        </div>
      </div>
    </footer>
  );
}
