import { Download, Headphones, Music, Users } from "lucide-react";

const features = [
  {
    icon: Music,
    title: "Discover Independent Artists",
    description:
      "Explore a curated catalog of emerging musicians you won't find on mainstream platforms.",
  },
  {
    icon: Headphones,
    title: "Stream Instantly",
    description:
      "Hit play and listen right away — no signup wall, no paywall, no friction.",
  },
  {
    icon: Download,
    title: "Download What You Have Rights To",
    description:
      "Every track shows its license. Download only what the artist has cleared for you to keep.",
  },
  {
    icon: Users,
    title: "Support Emerging Musicians",
    description:
      "Every play, like, and share helps independent artists grow their audience.",
  },
] as const;

export function WhyPlatform() {
  return (
    <section className="mt-20 sm:mt-28">
      {/* Section header */}
      <div className="mb-10 max-w-lg">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">
          Why this platform
        </p>
        <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
          Music discovery, done right.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
          Built for listeners who care about where their music comes from — and
          artists who deserve to be heard.
        </p>
      </div>

      {/* Card grid — 1 col mobile, 2 col tablet, 4 col desktop */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f) => (
          <article
            key={f.title}
            className="group rounded-2xl border border-line/60 bg-surface/50 p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/10"
          >
            {/* Icon circle */}
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent transition-colors duration-300 group-hover:bg-accent/25">
              <f.icon className="h-5 w-5" aria-hidden />
            </div>

            <h3 className="text-sm font-bold leading-snug">{f.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              {f.description}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
