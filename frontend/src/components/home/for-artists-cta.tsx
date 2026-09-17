import { ArrowRight, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ForArtistsCta() {
  return (
    <section className="mt-20 sm:mt-28">
      <div className="relative overflow-hidden rounded-3xl border border-accent/20">
        {/* ── Background treatment — gradient + subtle dot grid ── */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-br from-accent/10 via-surface/60 to-bg"
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />
        {/* Accent glow blob */}
        <div
          aria-hidden
          className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-accent/15 blur-[80px]"
        />
        <div
          aria-hidden
          className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-accent/10 blur-[60px]"
        />

        {/* ── Content ───────────────────────────────────── */}
        <div className="relative z-10 flex flex-col items-center px-6 py-14 text-center sm:px-12 sm:py-20">
          {/* Eyebrow badge */}
          <span className="mb-5 inline-flex items-center gap-1.5 rounded-pill border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
            <Upload className="h-3.5 w-3.5" aria-hidden />
            For Artists
          </span>

          <h2 className="max-w-md text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl">
            Share your music with the world
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
            Upload your tracks, set your license terms, and reach listeners who
            are actively looking for independent music. No gatekeepers, no
            algorithms burying your work.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button href="/upload" size="lg">
              Start Uploading
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
            <Button href="/register" variant="secondary" size="lg">
              Create an Account
            </Button>
          </div>

          {/* Trust line */}
          <p className="mt-6 text-[11px] text-muted/70">
            Free to upload · You keep your rights · No hidden fees
          </p>
        </div>
      </div>
    </section>
  );
}
