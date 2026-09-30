"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/api-url";
import { toast } from "@/stores/toast";
import type { LicenseType, Song } from "@/types/api";

const LICENSE_OPTIONS: { value: LicenseType | ""; label: string }[] = [
  { value: "", label: "Streaming only (no license)" },
  { value: "royalty_free", label: "Royalty-free" },
  { value: "artist_owned", label: "Artist-owned" },
  { value: "cc_by", label: "CC BY" },
  { value: "other", label: "Other" },
];

const FIELD_CLASS =
  "h-9 w-full rounded-card border border-line bg-surface px-3 text-xs outline-none placeholder:text-muted/60 focus:border-accent";

/**
 * Direct admin edit for any song, independent of the artist request queue.
 *
 * Every field is submitted on save, because the API reads an empty string as "clear
 * this field" and an absent field as "leave it alone" — so an emptied description or
 * genre really does get cleared. Replacing the audio file re-queues the background
 * probe, which is why the duration shown here can go back to pending.
 */
export function AdminSongEditor({
  song,
  onClose,
  onSaved,
}: {
  song: Song;
  onClose: () => void;
  onSaved: (song: Song) => void;
}) {
  const [title, setTitle] = useState(song.title);
  const [description, setDescription] = useState(song.description ?? "");
  const [genre, setGenre] = useState(song.genre ?? "");
  const [licenseType, setLicenseType] = useState<LicenseType | "">(song.license_type ?? "");
  const [rightsNote, setRightsNote] = useState(song.rights_note ?? "");
  const [downloads, setDownloads] = useState(song.download_allowed);
  const [note, setNote] = useState("");
  const [cover, setCover] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const form = new FormData();
    form.append("title", title);
    form.append("description", description);
    form.append("genre", genre);
    form.append("license_type", licenseType);
    form.append("rights_note", rightsNote);
    form.append("download_allowed", String(downloads));
    if (note.trim()) form.append("note", note.trim());
    if (cover) form.append("cover", cover);
    if (audio) form.append("audio", audio);

    setSaving(true);
    try {
      const updated = await api<Song>(`/api/admin/songs/${song.id}`, { method: "PATCH", formData: form });
      toast(`Saved “${updated.title}”`, "success");
      onSaved(updated);
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center"
      data-testid="admin-editor"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${song.title}`}
    >
      <div className="w-full max-w-2xl rounded-card border border-line bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-card border border-line bg-surface-2">
              {song.cover_url && (
                // eslint-disable-next-line @next/next/no-img-element -- dynamic URL
                <img
                  src={resolveMediaUrl(song.cover_url) ?? undefined}
                  alt={`${song.title} cover`}
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold">Direct edit</h2>
              <p className="truncate text-xs text-muted" data-testid="admin-editor-subject">
                {song.title} · {song.artist_name ?? "unknown artist"} · {song.status} ·{" "}
                {song.duration_sec ? `${song.duration_sec}s` : "probing…"}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" ariaLabel="Close editor" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Title</span>
            <input
              className={FIELD_CLASS}
              data-testid="admin-field-title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Genre</span>
            <input
              className={FIELD_CLASS}
              data-testid="admin-field-genre"
              value={genre}
              maxLength={80}
              placeholder="Clear to unset"
              onChange={(e) => setGenre(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Description</span>
            <textarea
              className="min-h-16 w-full rounded-card border border-line bg-surface px-3 py-2 text-xs outline-none placeholder:text-muted/60 focus:border-accent"
              data-testid="admin-field-description"
              value={description}
              maxLength={5000}
              placeholder="Clear to unset"
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">License</span>
            <select
              className={FIELD_CLASS}
              data-testid="admin-field-license"
              value={licenseType}
              onChange={(e) => setLicenseType(e.target.value as LicenseType | "")}
            >
              {LICENSE_OPTIONS.map((option) => (
                <option key={option.value || "none"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Rights note</span>
            <input
              className={FIELD_CLASS}
              data-testid="admin-field-rights"
              value={rightsNote}
              maxLength={2000}
              placeholder="Required for license type “Other”"
              onChange={(e) => setRightsNote(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              data-testid="admin-field-downloads"
              checked={downloads}
              onChange={(e) => setDownloads(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            Downloads allowed
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Audit note (optional)</span>
            <input
              className={FIELD_CLASS}
              data-testid="admin-field-note"
              value={note}
              maxLength={500}
              placeholder="Why is this being edited?"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Replace cover image</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              data-testid="admin-field-cover"
              onChange={(e) => setCover(e.target.files?.[0] ?? null)}
              className="text-xs text-muted file:mr-2 file:rounded-pill file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:text-ink"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Replace audio file</span>
            <input
              type="file"
              accept="audio/mpeg,audio/mp4,audio/wav"
              data-testid="admin-field-audio"
              onChange={(e) => setAudio(e.target.files?.[0] ?? null)}
              className="text-xs text-muted file:mr-2 file:rounded-pill file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:text-ink"
            />
          </label>
        </div>

        {audio && (
          <p className="mt-2 text-[11px] text-yellow-300" data-testid="admin-audio-reprobe-hint">
            Replacing the audio re-queues the probe: duration, bitrate and sample rate are recomputed from the new file.
          </p>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={saving} onClick={save} data-testid="admin-save">
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}
