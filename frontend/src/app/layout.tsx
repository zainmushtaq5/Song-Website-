import type { Metadata, Viewport } from "next";

import { PwaProvider } from "@/components/pwa/pwa-provider";
import { Providers } from "./providers";
import "../styles/globals.css";

const SITE_URL = "https://song-website-oylp.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Songs — Discover Your Next Sound", template: "%s · Songs" },
  description:
    "Discover emerging artists, listen instantly, and download music you love. Stream free music, explore new talent and download tracks with permission.",
  applicationName: "Songs",
  keywords: [
    "free music", "stream music online", "discover artists", "indie music",
    "download songs", "new music", "emerging artists", "music platform",
    "listen to music", "bollywood songs", "music streaming",
  ],
  authors: [{ name: "Songs Platform" }],
  creator: "Songs Platform",
  publisher: "Songs Platform",
  formatDetection: { telephone: false, email: false, address: false },
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  openGraph: {
    type: "website",
    siteName: "Songs",
    title: "Songs — Discover Your Next Sound",
    description: "Discover emerging artists, listen instantly, and download music you love. Stream free music online.",
    url: SITE_URL,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Songs — Music Platform" }],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Songs — Discover Your Next Sound",
    description: "Discover emerging artists, listen instantly, and download music you love.",
    images: ["/og-image.png"],
  },
  // Icon links come from the file conventions in src/app (icon.png, apple-icon.png).
  // Declaring `metadata.icons` would *replace* those, so it stays unset on purpose.
  appleWebApp: { capable: true, title: "Songs", statusBarStyle: "black-translucent" },
  verification: {
    // Add your Google Search Console verification code here when ready
    // google: "your-google-site-verification-code",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Installed/notched devices: draw edge-to-edge, then pad the shell back with
  // `--safe-t` / `--safe-b` (see src/styles/globals.css).
  viewportFit: "cover",
  themeColor: "#0a0a0d",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-ink antialiased">
        <Providers>
          <PwaProvider />
          {children}
        </Providers>
      </body>
    </html>
  );
}
