import { Music4, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";

const waveBars = [14, 26, 40, 62, 88, 72, 96, 54, 78, 46, 30, 58, 84, 40, 20, 48, 68, 34, 22, 12];

export function Hero() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-line">
      {/* --- background layers (content sits above, z-10) --- */}
      {/* base vertical gradient */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-surface-2 via-bg to-bg" />
      {/* gradient mesh blobs */}
      <div aria-hidden className="absolute inset-0">
        <div className="absolute -top-32 right-[-10%] h-96 w-96 rounded-full bg-accent/25 blur-[100px]" />
        <div className="absolute left-[-8%] top-1/3 h-80 w-80 rounded-full bg-accent/15 blur-[90px]" />
        <div className="absolute bottom-[-35%] left-1/3 h-72 w-72 rounded-full bg-accent/10 blur-[80px]" />
      </div>
      {/* dot grid, fading toward the edges */}
      <div
        aria-hidden
        className="bg-dot-grid absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_75%)]"
      />
      {/* oversized waveform, very low contrast */}
      <svg
        aria-hidden
        role="presentation"
        width="340"
        height="170"
        viewBox="0 0 340 170"
        className="absolute right-10 top-1/2 hidden -translate-y-1/2 opacity-40 lg:block"
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

      {/* --- content --- */}
      <div className="relative z-10 max-w-xl px-6 py-16 sm:px-12 sm:py-24 lg:py-28">
        <span className="mb-5 inline-flex items-center gap-1.5 rounded-pill border border-line bg-bg/60 px-3 py-1 text-xs text-muted backdrop-blur">
          <Music4 className="h-3.5 w-3.5 text-accent" aria-hidden />
          Emerging &amp; independent artists
        </span>
        <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
          FIND YOUR
          <br />
          NEXT{" "}
          <span className="bg-gradient-to-r from-accent to-accent-strong bg-clip-text text-transparent">
            SOUND.
          </span>
        </h1>
        <p className="mt-6 max-w-md text-base leading-relaxed text-muted sm:text-lg">
          Discover emerging artists, listen instantly, and download music you have permission to keep.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Button href="/#feed" size="lg">
            Explore Music
          </Button>
          <Button href="/upload" variant="secondary" size="lg">
            <Upload className="h-4 w-4" aria-hidden />
            Upload Your Music
          </Button>
        </div>
      </div>
    </section>
  );
}
