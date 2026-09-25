"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/hooks/use-online-status";

/**
 * Slim "you're offline" notice rendered by the app shell, so it shows up on every
 * in-app page. Unvisited routes fall back to the standalone `/offline` document.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (online) setRetrying(false);
  }, [online]);

  if (online) return null;

  return (
    <div
      role="status"
      data-testid="offline-banner"
      className="sticky top-[calc(3.5rem+var(--safe-t))] z-[45] border-b border-line bg-surface/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs sm:px-6">
        <WifiOff className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
        <p className="min-w-0 flex-1">
          <span className="font-medium text-ink">You&rsquo;re offline.</span>{" "}
          <span className="text-muted">
            Pages you already opened and files you downloaded still work — new searches and streaming
            need a connection.
          </span>
        </p>
        <Button
          variant="secondary"
          size="sm"
          loading={retrying}
          onClick={() => {
            setRetrying(true);
            window.location.reload();
          }}
        >
          Retry
        </Button>
      </div>
    </div>
  );
}
