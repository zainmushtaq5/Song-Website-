import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SongDetail } from "@/components/music/song-detail";
import { API_URL } from "@/lib/api-url";
import type { Song } from "@/types/api";

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getSong(slug: string): Promise<Song | null> {
  try {
    const res = await fetch(`${API_URL}/api/songs/by-slug/${encodeURIComponent(slug)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Song;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const song = await getSong(slug);
  if (!song) return { title: "Song not found" };
  return {
    title: song.title,
    description: song.description ?? `${song.title} by ${song.artist_name ?? "unknown artist"}`,
  };
}

export default async function SongPage({ params }: PageProps) {
  const { slug } = await params;
  const song = await getSong(slug);
  if (!song) notFound();
  return <SongDetail song={song} />;
}
