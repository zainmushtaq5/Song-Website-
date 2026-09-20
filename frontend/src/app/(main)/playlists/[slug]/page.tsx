import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PlaylistDetailContent } from "@/components/playlists/playlist-detail";
import { API_URL } from "@/lib/api-url";
import type { PlaylistDetail } from "@/types/api";

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getPlaylist(slug: string): Promise<PlaylistDetail | null> {
  try {
    const res = await fetch(`${API_URL}/api/playlists/${encodeURIComponent(slug)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as PlaylistDetail;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const pl = await getPlaylist(slug);
  if (!pl) return { title: "Playlist not found" };
  return {
    title: pl.name,
    description: pl.description ?? `A playlist by ${pl.owner} on Songs.`,
  };
}

export default async function PlaylistPage({ params }: PageProps) {
  const { slug } = await params;
  const pl = await getPlaylist(slug);
  if (!pl) notFound();
  return <PlaylistDetailContent playlist={pl} />;
}
