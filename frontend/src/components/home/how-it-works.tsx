import { Download, Headphones, Search } from "lucide-react";

import { StaggerGroup, StaggerItem } from "@/components/motion/reveal";

const steps = [
  {
    icon: Search,
    number: "01",
    title: "Discover",
    description: "Browse trending tracks, search by genre, or explore artist profiles to find your next favorite song.",
  },
  {
    icon: Headphones,
    number: "02",
    title: "Listen",
    description: "Stream any track instantly — no account required. Save what you love to your personal library.",
  },
  {
    icon: Download,
    number: "03",
    title: "Download",
    description: "Every track shows its license clearly. Download what the artist has cleared for you to keep.",
  },
] as const;

export function HowItWorks() {
  return (
    <section className="mt-20 sm:mt-28">
      {/* Section header */}
      <div className="mb-12 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">
          Simple by design
        </p>
        <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
          How it works
        </h2>
      </div>

      {/* Steps — vertical on mobile, horizontal with connector on md+ */}
      <div className="relative mx-auto max-w-3xl">
        {/* ── Connecting line (desktop only) ──────────────── */}
        <div
          aria-hidden
          className="absolute left-0 right-0 top-[3.25rem] hidden h-px bg-gradient-to-r from-transparent via-line to-transparent md:block"
        />

        <div className="grid gap-10 md:grid-cols-3 md:gap-6">
          <StaggerGroup className="contents md:grid md:grid-cols-3 md:gap-6" stagger={0.14}>
            {steps.map((step, i) => (
              <StaggerItem key={step.number} className="relative flex flex-col items-center text-center">
                {/* ── Mobile connector line (between cards) ──── */}
                {i < steps.length - 1 && (
                  <div
                    aria-hidden
                    className="absolute -bottom-6 left-1/2 h-3 w-px bg-line md:hidden"
                  />
                )}

                {/* Step circle */}
                <div className="relative z-10 flex h-[6.5rem] w-[6.5rem] flex-col items-center justify-center rounded-full border border-line/60 bg-surface/80 shadow-sm transition-all duration-300 hover:border-accent/50 hover:shadow-md hover:shadow-accent/10">
                  <step.icon className="h-6 w-6 text-accent" aria-hidden />
                  <span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted">
                    Step {step.number}
                  </span>
                </div>

                {/* Arrow between circles (desktop) */}
                {i < steps.length - 1 && (
                  <svg
                    aria-hidden
                    className="absolute -right-3 top-[3rem] hidden h-3 w-3 text-accent/60 md:block"
                    viewBox="0 0 12 12"
                    fill="currentColor"
                  >
                    <path d="M2 1l8 5-8 5V1z" />
                  </svg>
                )}

                {/* Text */}
                <h3 className="mt-5 text-base font-bold">{step.title}</h3>
                <p className="mt-1.5 max-w-[14rem] text-xs leading-relaxed text-muted">
                  {step.description}
                </p>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </div>
    </section>
  );
}
