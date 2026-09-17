"use client";

import Link from "next/link";
import { Mic2, Music4, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/api-url";
import type { ArtistPublic } from "@/types/api";

export function RisingArtists() {
  const [artists, setArtists] = useState<ArtistPublic[] | null>(null);
  const [error, setError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    api<ArtistPublic[]>("/api/artists")
      .then((data) => {
        if (active) setArtists(data);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  /* Horizontal drag-scroll for mouse users */
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  function onPointerDown(e: React.PointerEvent) {
    const el = scrollRef.current;
    if (!el) return;
    setIsDragging(true);
    setStartX(e.pageX - el.offsetLeft);
    setScrollLeft(el.scrollLeft);
    el.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!isDragging) return;
    const el = scrollRef.current;
    if (!el) return;
    const x = e.pageX - el.offsetLeft;
    el.scrollLeft = scrollLeft - (x - startX);
  }

  function onPointerUp() {
    setIsDragging(false);
  }

  // Don't render the section at all if the fetch failed or returned empty
  if (error) return null;
  if (artists !== null && artists.length === 0) return null;

  return (
    <section className="mt-20 sm:mt-28">
      {/* Section header */}
      <div className="mb-8">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-accent">
          <Users className="h-4 w-4" aria-hidden />
          Rising artists
        </p>
        <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
          Artists to watch
        </h2>
      </div>

      {/* Scrollable row */}
      <div
        ref={scrollRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="scrollbar-hide -mx-4 flex gap-5 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6"
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
      >
        {artists === null
          ? /* Skeleton placeholders */
            Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="flex w-28 shrink-0 flex-col items-center gap-3 sm:w-32"
              >
                <div className="h-24 w-24 animate-pulse rounded-full bg-surface-2 sm:h-28 sm:w-28" />
                <div className="h-3 w-16 animate-pulse rounded bg-surface-2" />
              </div>
            ))
          : artists.map((artist) => (
              <Link
                key={artist.id}
                href={`/artists/${artist.slug}`}
                className="group flex w-28 shrink-0 flex-col items-center gap-3 sm:w-32"
                draggable={false}
              >
                {/* Circular avatar */}
                <div className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-line/60 bg-surface-2 transition-all duration-300 group-hover:border-accent/60 group-hover:shadow-lg group-hover:shadow-accent/15 sm:h-28 sm:w-28">
                  {artist.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveMediaUrl(artist.avatar_url) ?? undefined}
                      alt={artist.name}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-accent/60">
                      <Mic2 className="h-8 w-8" aria-hidden />
                    </div>
                  )}
                  {/* Accent ring on hover */}
                  <div
                    aria-hidden
                    className="absolute inset-0 rounded-full ring-2 ring-accent/0 transition-all duration-300 group-hover:ring-accent/40"
                  />
                </div>

                {/* Name */}
                <div className="text-center">
                  <p className="truncate text-sm font-semibold transition-colors duration-150 group-hover:text-accent">
                    {artist.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">Artist</p>
                </div>
              </Link>
            ))}
      </div>
    </section>
  );
}
