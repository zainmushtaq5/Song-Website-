import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",        // Don't index backend API routes
          "/admin/",      // Don't index admin panel
          "/profile/",    // Don't index private profile pages
          "/library/",    // Don't index personal library
          "/upload/",     // Don't index upload page
          "/notifications/", // Don't index notifications
        ],
      },
    ],
    sitemap: "https://song-website-oylp.vercel.app/sitemap.xml",
    host: "https://song-website-oylp.vercel.app",
  };
}
