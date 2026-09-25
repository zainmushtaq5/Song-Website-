import type { MetadataRoute } from "next";

/** Brand surfaces that must match the icon art / `theme-color` (see public/icons). */
const BACKGROUND = "#0a0a0d";

/**
 * Web app manifest, served by Next at `/manifest.webmanifest` and linked from the
 * document head automatically.
 *
 * `display: standalone` + a 512px maskable icon + `start_url` are the three fields
 * Chrome's installability check actually requires; the rest is platform polish.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Songs — Discover Your Next Sound",
    short_name: "Songs",
    description:
      "Discover emerging artists, listen instantly, and download music you have permission to keep.",
    lang: "en",
    dir: "ltr",
    scope: "/",
    start_url: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: BACKGROUND,
    theme_color: BACKGROUND,
    categories: ["music", "entertainment"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Search songs",
        short_name: "Search",
        description: "Find songs and artists",
        url: "/search",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "My library",
        short_name: "Library",
        description: "Liked songs, playlists and downloads",
        url: "/library",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Upload a song",
        short_name: "Upload",
        description: "Share your music with listeners",
        url: "/upload",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
