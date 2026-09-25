import type { Metadata, Viewport } from "next";

import { PwaProvider } from "@/components/pwa/pwa-provider";
import { Providers } from "./providers";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: { default: "Songs — Discover Your Next Sound", template: "%s · Songs" },
  description:
    "Discover emerging artists, listen instantly, and download music you have permission to keep.",
  applicationName: "Songs",
  formatDetection: { telephone: false, email: false, address: false },
  // Icon links come from the file conventions in src/app (icon.png, apple-icon.png).
  // Declaring `metadata.icons` would *replace* those, so it stays unset on purpose.
  appleWebApp: { capable: true, title: "Songs", statusBarStyle: "black-translucent" },
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
