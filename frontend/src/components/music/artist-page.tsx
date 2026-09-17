"use client";

import { useState } from "react";

import { Music4, UserRound, Users } from "lucide-react";

import { FollowButton } from "@/components/music/follow-button";
import { SongCard } from "@/components/music/song-card";
import { EmptyState } from "@/components/ui/empty-state";
import { resolveMediaUrl } from "@/lib/api-url";
import { formatCount } from "@/lib/format";
import type { ArtistPublic } from "@/types/api";

export function ArtistPageContent({ artist }: { artist: ArtistPublic }) {
  const songs = artist.songs ?? [];
  const [followerCount, setFollowerCount] = useState(artist.follower_count ?? 0);

  return (
    <div>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-pill border border-line bg-surface-2 sm:h-24 sm:w-24">
          {artist.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- dynamic URL
            <img
              src={resolveMediaUrl(artist.avatar_url) ?? undefined}
              alt={`${artist.name} avatar`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-accent" aria-hidden>
              <UserRound className="h-8 w-8" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-widest text-muted">Artist</p>
          <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl">{artist.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <Users className="h-3.5 w-3.5" aria-hidden />
            {formatCount(followerCount)} {followerCount === 1 ? "follower" : "followers"}
          </p>
          {artist.bio && <p className="mt-1.5 max-w-xl text-sm text-muted">{artist.bio}</p>}
        </div>
        <div className="shrink-0 self-start sm:self-center">
          <FollowButton
            artistId={artist.id}
            artistSlug={artist.slug}
            onToggled={(following) => setFollowerCount((c) => Math.max(0, c + (following ? 1 : -1)))}
          />
        </div>
      </div>

      <h2 className="mb-4 mt-10 flex items-center gap-2 text-lg font-bold tracking-tight">
        <Music4 className="h-4.5 w-4.5 text-accent" aria-hidden />
        Songs
      </h2>
      {songs.length === 0 ? (
        <EmptyState
          icon={<Music4 className="h-6 w-6" aria-hidden />}
          title="No published songs yet."
          message={`${artist.name} hasn't released any approved songs yet. Check back soon.`}
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {songs.map((song) => (
            <SongCard key={song.id} song={song} queue={songs} />
          ))}
        </div>
      )}
    </div>
  );
}
