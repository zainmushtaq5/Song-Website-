"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { SongCard } from "@/components/music/song-card";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import type { Song } from "@/types/api";

interface RecommendationArtist {
  id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
}

interface RecommendationResponse {
  songs: Song[];
  artists: RecommendationArtist[];
}

/** "Recommended for you" — rule-based picks from the user's likes/plays. */
export function Recommended() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api<RecommendationResponse>("/api/recommendations")
      .then((r) => {
        setData(r);
        setDone(true);
      })
      .catch(() => setDone(true));
  }, [user]);

  if (!done || !data || data.songs.length === 0) return null;

  return (
    <section id="recommended" className="mt-14">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {user ? "Picked for you" : "Popular right now"}
          </p>
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            {user ? "Recommended For You" : "You Might Like"}
          </h2>
          <p className="mt-1 text-xs text-muted">
            {user
              ? "Based on what you've liked and played."
              : "A mix of what listeners are enjoying right now."}
          </p>
        </div>
        {data.artists.length > 0 && (
          <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Artists to try</p>
            <div className="flex gap-2">
              {data.artists.slice(0, 3).map((a) => (
                <Link
                  key={a.id}
                  href={`/artists/${a.slug}`}
                  className="rounded-pill border border-line bg-surface px-3 py-1 text-xs font-semibold text-muted transition-colors hover:border-accent hover:text-accent"
                >
                  {a.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {data.songs.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
          {data.songs.slice(0, 6).map((song) => (
            <SongCard key={song.id} song={song} queue={data.songs} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Sparkles className="h-6 w-6" aria-hidden />}
          title="Nothing to recommend yet."
          message="Like and play some songs and picks will show up here."
        />
      )}
    </section>
  );
}