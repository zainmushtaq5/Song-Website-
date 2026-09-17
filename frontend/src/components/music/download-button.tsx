"use client";

import { Download } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { resolveMediaUrl } from "@/lib/api-url";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/toast";

interface DownloadButtonProps {
  songId: string;
  songTitle: string;
  downloadAllowed: boolean;
}

export function DownloadButton({ songId, songTitle, downloadAllowed }: DownloadButtonProps) {
  const user = useAuthStore((s) => s.user);
  const [busy, setBusy] = useState(false);

  async function onDownload() {
    if (!user) {
      toast("Log in to download songs", "info");
      return;
    }
    if (!downloadAllowed) {
      toast("This song is streaming only", "info");
      return;
    }
    setBusy(true);
    try {
      const out = await api<{ download_url: string }>(`/api/songs/${songId}/download`, {
        method: "POST",
      });
      const a = document.createElement("a");
      a.href = resolveMediaUrl(out.download_url) ?? out.download_url;
      a.download = "";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast("Download started", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Download unavailable", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      loading={busy}
      onClick={onDownload}
      ariaLabel={
        downloadAllowed
          ? user
            ? "Download song"
            : "Log in to download song"
          : "Streaming only — download unavailable"
      }
      disabled={!downloadAllowed}
      className={downloadAllowed ? "" : "opacity-40"}
    >
      <Download className="h-4 w-4" aria-hidden />
    </Button>
  );
}
