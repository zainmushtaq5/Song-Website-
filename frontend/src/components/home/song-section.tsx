"use client";

import { Flame, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { StaggerGroup, StaggerItem } from "@/components/motion/reveal";
import { SongCard } from "@/components/music/song-card";
import { EmptyState, SkeletonCard } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import type { Song } from "@/types/api";

interface SongSectionProps {
  title: string;
  eyebrow: string;
  sort: "recent" | "trending";
  limit?: number;
  /** "band" wraps the section in a subtly contrasting panel for visual rhythm */
  variant?: "plain" | "band";
}

export function SongSection({ title, eyebrow, sort, limit = 12, variant = "plain" }: SongSectionProps) {
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    api<Song[]>(`/api/songs?sort=${sort}&page_size=${limit}`)
      .then((out) => {
        if (active) setSongs(out);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [sort, limit]);

  const icons = { trending: Flame, recent: Sparkles } as const;
  const Icon = icons[sort];

  return (
    <section id={sort === "trending" ? "feed" : undefined} className="mt-16 sm:mt-20">
      <div className="mb-7">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-accent">
          <Icon className="h-4 w-4" aria-hidden />
          {eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h2>
      </div>

      {variant === "band" ? (
        <div className="-mx-2 rounded-3xl border border-line/70 bg-surface/40 px-4 py-8 sm:mx-0 sm:px-7 sm:py-10">
          <SectionBody
            songs={songs}
            error={error}
            icon={<Icon className="h-6 w-6" aria-hidden />}
            title={title}
            eyebrow={eyebrow}
          />
        </div>
      ) : (
        <SectionBody
          songs={songs}
          error={error}
          icon={<Icon className="h-6 w-6" aria-hidden />}
          title={title}
          eyebrow={eyebrow}
        />
      )}
    </section>
  );
}

function SectionBody({
  songs,
  error,
  icon,
  title,
}: {
  songs: Song[] | null;
  error: boolean;
  icon: React.ReactNode;
  title: string;
  eyebrow: string;
}) {
  if (error) {
    return (
      <EmptyState
        icon={icon}
        title="Something went wrong"
        message="We couldn't load songs right now. Check your connection and try again."
      />
    );
  }
  if (songs === null) {
    return (
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }
  if (songs.length === 0) {
    return (
      <EmptyState
        icon={icon}
        title="Nothing here yet."
        message="No songs have been approved in this section yet. Be the first — upload your music."
        ctaLabel="Explore Music"
        ctaHref="/"
      />
    );
  }
  return (
    <StaggerGroup
      className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-6"
      stagger={0.05}
    >
      {songs.map((song) => (
        <StaggerItem key={song.id}>
          <SongCard song={song} queue={songs} />
        </StaggerItem>
      ))}
    </StaggerGroup>
  );
}
