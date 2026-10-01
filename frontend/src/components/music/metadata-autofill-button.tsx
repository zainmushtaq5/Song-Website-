"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";
import type { LicenseType, SongMetadataLookup } from "@/types/api";

export interface AutofillData {
  title?: string;
  genre?: string;
  licenseType?: LicenseType;
  downloadAllowed?: boolean;
  description?: string;
  coverFile?: File;
  coverDataUrl?: string;
  artistName?: string | null;
  album?: string | null;
}

interface MetadataAutofillButtonProps {
  songTitle: string;
  audioFile?: File | null;
  onFill: (data: AutofillData) => void;
  className?: string;
  size?: "sm" | "md" | "lg" | "icon";
}

/**
 * Auto-detects song title, genre, artwork and royalty/license type from internet
 * public APIs (iTunes, Deezer, MusicBrainz) and passes the populated fields back to form.
 */
export function MetadataAutofillButton({
  songTitle,
  audioFile,
  onFill,
  className,
  size = "sm",
}: MetadataAutofillButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleAutofill() {
    let query = songTitle.trim();

    // If title is empty, deduce query from selected audio file name
    if (!query && audioFile) {
      query = audioFile.name
        .replace(/\.[^/.]+$/, "") // strip extension like .mp3, .wav
        .replace(/^\d+[\s.-]+/, "") // strip track numbers like "01. " or "02 - "
        .replace(/[_-]/g, " ") // replace underscores/dashes with spaces
        .trim();
    }

    if (!query) {
      toast("Please enter a song name or select an audio file first.", "error");
      return;
    }

    setLoading(true);
    try {
      const data = await api<SongMetadataLookup>(
        `/api/songs/lookup-metadata?title=${encodeURIComponent(query)}`
      );

      if (!data || (!data.genre && !data.cover_url && !data.artist_name)) {
        toast(`No internet metadata found for “${query}”. Please fill manually.`, "error");
        return;
      }

      let coverFile: File | undefined;
      if (data.cover_data_url) {
        try {
          const res = await fetch(data.cover_data_url);
          const blob = await res.blob();
          const cleanName = (data.song_name || "artwork").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
          // Use explicit type and extension so backend MIME validation passes
          const fileType = blob.type.startsWith("image/") ? blob.type : "image/jpeg";
          const ext = fileType === "image/png" ? ".png" : fileType === "image/webp" ? ".webp" : ".jpg";
          coverFile = new File([blob], `${cleanName}_cover${ext}`, { type: fileType });
        } catch {
          // If blob conversion fails, proceed without image file — user can upload manually
        }
      }

      onFill({
        title: data.song_name || query,
        genre: data.genre || undefined,
        licenseType: data.license_type,
        downloadAllowed: data.download_allowed,
        description: data.description || undefined,
        coverFile,
        coverDataUrl: data.cover_data_url || data.cover_url || undefined,
        artistName: data.artist_name,
        album: data.album,
      });

      const details = [
        data.genre ? `Genre: ${data.genre}` : null,
        data.license_type ? `License: ${data.license_type.replace("_", " ")}` : null,
        coverFile ? "Artwork downloaded" : null,
      ]
        .filter(Boolean)
        .join(" · ");

      toast(
        `✨ Auto-filled “${data.song_name || query}”${data.artist_name ? ` by ${data.artist_name}` : ""}! (${details})`,
        "success"
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to lookup song metadata from internet", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      disabled={loading}
      onClick={handleAutofill}
      className={className}
      ariaLabel="Auto-fill song metadata and artwork from internet"
    >
      {loading ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" aria-hidden />
          <span>Searching internet…</span>
        </>
      ) : (
        <>
          <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
          <span>Auto-fill from internet</span>
        </>
      )}
    </Button>
  );
}
