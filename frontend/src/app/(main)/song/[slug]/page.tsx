import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";

import { SongDetail } from "@/components/music/song-detail";
import { API_URL } from "@/lib/api-url";
import type { Song } from "@/types/api";

const SITE_URL = "https://song-website-oylp.vercel.app";

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getSong(slug: string): Promise<Song | null> {
  try {
    const res = await fetch(`${API_URL}/api/songs/by-slug/${encodeURIComponent(slug)}`, {
      next: { revalidate: 3600 }, // Cache for 1 hour — good for SEO crawlers
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

  const title = `${song.title} by ${song.artist_name ?? "Unknown Artist"}`;
  const description =
    song.description ??
    `Listen to ${song.title} by ${song.artist_name ?? "Unknown Artist"} on Songs — stream free music online.`;
  const url = `${SITE_URL}/song/${slug}`;
  const image = song.cover_url ?? `${SITE_URL}/og-image.png`;

  return {
    title: song.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "music.song",
      title,
      description,
      url,
      siteName: "Songs",
      images: [{ url: image, width: 600, height: 600, alt: `${song.title} cover art` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function SongPage({ params }: PageProps) {
  const { slug } = await params;
  const song = await getSong(slug);
  if (!song) notFound();

  // JSON-LD structured data — makes Google show rich results for this song
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    name: song.title,
    byArtist: {
      "@type": "MusicGroup",
      name: song.artist_name ?? "Unknown Artist",
      url: song.artist_slug ? `${SITE_URL}/artists/${song.artist_slug}` : undefined,
    },
    duration: song.duration_sec
      ? `PT${Math.floor(song.duration_sec / 60)}M${song.duration_sec % 60}S`
      : undefined,
    url: `${SITE_URL}/song/${slug}`,
    image: song.cover_url ?? undefined,
    description: song.description ?? undefined,
    genre: song.genre ?? undefined,
  };

  return (
    <>
      <Script
        id="song-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SongDetail song={song} />
    </>
  );
}
