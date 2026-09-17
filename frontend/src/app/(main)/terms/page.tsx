import type { Metadata } from "next";

import { LegalPageShell } from "@/components/layout/legal-page-shell";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms of Service" updated="Placeholder — final version ships with production">
      <p>
        These terms govern your use of Songs. By creating an account, uploading music, or
        downloading tracks, you agree to them.
      </p>
      <h2>1. Your account</h2>
      <p>
        You are responsible for your account and the content you upload. Upload only music you
        have the rights to distribute.
      </p>
      <h2>2. Uploads and licensing</h2>
      <p>
        When you upload a track you declare your rights to it. Tracks are reviewed before they
        appear publicly, and downloads are only enabled where you have declared a license.
      </p>
      <h2>3. Downloads</h2>
      <p>
        Downloadable tracks are provided under the license shown on each song page. Do not
        redistribute beyond what the license allows.
      </p>
    </LegalPageShell>
  );
}
