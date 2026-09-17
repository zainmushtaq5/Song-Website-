import type { Metadata } from "next";

import { LegalPageShell } from "@/components/layout/legal-page-shell";

export const metadata: Metadata = { title: "Copyright Policy" };

export default function CopyrightPage() {
  return (
    <LegalPageShell title="Copyright Policy" updated="Placeholder — final version ships with production">
      <p>
        Songs only hosts music its uploaders have declared rights to. Every track is reviewed
        before it appears publicly.
      </p>
      <h2>Reporting infringement</h2>
      <p>
        If you believe a track infringes your copyright, contact us with the track link and
        details of your claim. We will investigate and remove tracks that violate rights.
      </p>
      <h2>Repeat infringers</h2>
      <p>Accounts that repeatedly upload unauthorized music will be terminated.</p>
    </LegalPageShell>
  );
}
