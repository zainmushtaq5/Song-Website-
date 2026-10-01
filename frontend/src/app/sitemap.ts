import type { MetadataRoute } from "next";

const SITE_URL = "https://song-website-oylp.vercel.app";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? SITE_URL;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE_URL}/search`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/library`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/upload`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/copyright`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  ];

  // Dynamic song pages
  let songPages: MetadataRoute.Sitemap = [];
  try {
    const res = await fetch(`${API_URL}/api/songs?sort=recent&page_size=100`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const songs = await res.json() as Array<{ slug: string; created_at: string }>;
      songPages = songs.map((song) => ({
        url: `${SITE_URL}/song/${song.slug}`,
        lastModified: new Date(song.created_at),
        changeFrequency: "weekly" as const,
        priority: 0.9,
      }));
    }
  } catch {
    // If API is down, return static pages only — don't crash the build
  }

  // Dynamic artist pages
  let artistPages: MetadataRoute.Sitemap = [];
  try {
    const res = await fetch(`${API_URL}/api/artists?page_size=100`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const artists = await res.json() as Array<{ slug: string }>;
      artistPages = artists.map((artist) => ({
        url: `${SITE_URL}/artists/${artist.slug}`,
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));
    }
  } catch {
    // Graceful fallback
  }

  return [...staticPages, ...songPages, ...artistPages];
}
