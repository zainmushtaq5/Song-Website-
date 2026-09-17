"use client";

import { Heart } from "lucide-react";
import { useEffect, useState } from "react";

import { SongCard } from "@/components/music/song-card";
import { Button } from "@/components/ui/button";
import { EmptyState, SkeletonCard } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { useLikesStore } from "@/stores/likes";
import type { Song } from "@/types/api";

export default function LibraryPage() {
  const user = useAuthStore((s) => s.user);
  const [mounted, setMounted] = useState(false);
  const [songs, setSongs] = useState<Song[] | null>(null);
  const likedIds = useLikesStore((s) => s.likedIds);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!user) return;
    api<Song[]>("/api/users/me/likes")
      .then(setSongs)
      .catch(() => setSongs([]));
  }, [user]);

  if (!mounted) return null;

  if (!user) {
    return (
      <EmptyState
        icon={<Heart className="h-6 w-6" aria-hidden />}
        title="Your liked songs live here."
        message="Log in to keep track of the music you love."
        ctaLabel="Log in"
        ctaHref="/login?next=/library"
      />
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">Liked Songs</h1>
      {songs === null ? (
        <div className="mt-8 flex gap-4 overflow-hidden">
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : songs.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<Heart className="h-6 w-6" aria-hidden />}
            title="Nothing here yet."
            message="Tap the heart on any song to save it to your library."
            ctaLabel="Explore Music"
            ctaHref="/"
          />
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {songs.map((song) => (
            <SongCard key={song.id} song={song} queue={songs} />
          ))}
        </div>
      )}
    </div>
  );
}
