"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Full-page navigation (not a client-side route change) so the offline shell can
 * hand control back to the network as soon as the connection is restored.
 */
export function RetryButton({ href = "/", label = "Try again" }: { href?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      loading={busy}
      onClick={() => {
        setBusy(true);
        window.location.href = href;
      }}
    >
      {label}
    </Button>
  );
}
