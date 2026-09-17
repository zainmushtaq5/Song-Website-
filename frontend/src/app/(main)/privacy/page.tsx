import type { Metadata } from "next";

import { LegalPageShell } from "@/components/layout/legal-page-shell";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy" updated="Placeholder — final version ships with production">
      <p>
        We collect the minimum data needed to run the platform: your email, username, and usage
        data (plays, likes, downloads).
      </p>
      <h2>What we store</h2>
      <p>Account details you provide, and engagement events tied to your account.</p>
      <h2>What we don&apos;t do</h2>
      <p>We don&apos;t sell your data, and we don&apos;t track you across other sites.</p>
    </LegalPageShell>
  );
}
