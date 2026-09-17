import type { Metadata } from "next";

import { Providers } from "./providers";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: { default: "Songs — Discover Your Next Sound", template: "%s · Songs" },
  description:
    "Discover emerging artists, listen instantly, and download music you have permission to keep.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
