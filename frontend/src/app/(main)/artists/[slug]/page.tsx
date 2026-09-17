import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArtistPageContent } from "@/components/music/artist-page";
import { API_URL } from "@/lib/api-url";
import type { ArtistPublic } from "@/types/api";

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getArtist(slug: string): Promise<ArtistPublic | null> {
  try {
    const res = await fetch(`${API_URL}/api/artists/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as ArtistPublic;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const artist = await getArtist(slug);
  return artist ? { title: artist.name, description: artist.bio ?? `Music by ${artist.name}` } : { title: "Artist not found" };
}

export default async function ArtistPage({ params }: PageProps) {
  const { slug } = await params;
  const artist = await getArtist(slug);
  if (!artist) notFound();
  return <ArtistPageContent artist={artist} />;
}
