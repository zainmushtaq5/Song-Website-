"use client";

import Link from "next/link";
import { Music4, UploadCloud } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/toast";
import type { LicenseType, Song } from "@/types/api";

const LICENSE_OPTIONS: { value: LicenseType | ""; label: string }[] = [
  { value: "artist_owned", label: "I own this recording (artist-owned)" },
  { value: "royalty_free", label: "Royalty-free" },
  { value: "cc_by", label: "Creative Commons CC BY" },
  { value: "other", label: "Other (describe below)" },
];

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-yellow-500/15 text-yellow-300",
  APPROVED: "bg-green-500/15 text-green-300",
  REJECTED: "bg-red-500/15 text-red-300",
};

export default function UploadPage() {
  const user = useAuthStore((s) => s.user);
  const [mounted, setMounted] = useState(false);
  const [uploads, setUploads] = useState<Song[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    genre: "",
    download_allowed: false,
    license_type: "artist_owned" as LicenseType | "",
    rights_note: "",
  });
  const [audio, setAudio] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (user) {
      api<Song[]>("/api/songs/mine")
        .then(setUploads)
        .catch(() => setUploads([]));
    }
  }, [user, busy]);

  if (!mounted) return null;

  if (!user) {
    return (
      <EmptyState
        icon={<UploadCloud className="h-6 w-6" aria-hidden />}
        title="Share your music."
        message="Log in to upload your songs."
        ctaLabel="Log in"
        ctaHref="/login?next=/upload"
      />
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!audio || !cover) {
      setFileError("Both an audio file and a cover image are required.");
      return;
    }
    setFileError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("title", form.title.trim());
      if (form.description.trim()) fd.append("description", form.description.trim());
      if (form.genre.trim()) fd.append("genre", form.genre.trim());
      fd.append("download_allowed", String(form.download_allowed));
      if (form.download_allowed && form.license_type) fd.append("license_type", form.license_type);
      if (form.rights_note.trim()) fd.append("rights_note", form.rights_note.trim());
      fd.append("audio", audio);
      fd.append("cover", cover);
      await api<Song>("/api/songs", { method: "POST", formData: fd });
      toast("Upload submitted for review", "success");
      setForm({ ...form, title: "", description: "", rights_note: "" });
      setAudio(null);
      setCover(null);
      for (const id of ["audio-input", "cover-input"]) {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (el) el.value = "";
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return UploadView({ form, setForm, setAudio, setCover, busy, fileError, uploads, onSubmit });
}

function UploadView(props: {
  form: { title: string; description: string; genre: string; download_allowed: boolean; license_type: LicenseType | ""; rights_note: string };
  setForm: (fn: (f: typeof props.form) => typeof props.form) => void;
  setAudio: (f: File | null) => void;
  setCover: (f: File | null) => void;
  busy: boolean;
  fileError: string | null;
  uploads: Song[] | null;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const { form, busy, fileError, uploads } = props;
  const setForm = props.setForm;
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-extrabold tracking-tight">Upload a song</h1>
      <p className="mt-1 text-sm text-muted">
        Uploads are reviewed by our team before they appear on the platform. You&apos;ll only upload music you have
        the rights to distribute.
      </p>

      <form onSubmit={props.onSubmit} className="mt-6 flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
        <Input
          label="Title"
          required
          maxLength={200}
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
        <Textarea
          label="Description (optional)"
          maxLength={5000}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
        <Input
          label="Genre (optional)"
          maxLength={80}
          placeholder="e.g. Lo-Fi, Hip-Hop"
          value={form.genre}
          onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="audio-input" className="text-sm text-muted">
              Audio file (MP3, M4A, WAV — max 50 MB)
            </label>
            <input
              id="audio-input"
              type="file"
              accept="audio/mpeg,audio/mp4,audio/wav,.mp3,.m4a,.wav"
              required
              onChange={(e) => props.setAudio(e.target.files?.[0] ?? null)}
              className="text-sm file:mr-3 file:rounded-pill file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:text-ink"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cover-input" className="text-sm text-muted">
              Cover image (JPG, PNG, WebP — max 5 MB)
            </label>
            <input
              id="cover-input"
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              required
              onChange={(e) => props.setCover(e.target.files?.[0] ?? null)}
              className="text-sm file:mr-3 file:rounded-pill file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:text-ink"
            />
          </div>
        </div>
        {fileError && <p className="text-xs text-red-400">{fileError}</p>}

        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={form.download_allowed}
            onChange={(e) => setForm((f) => ({ ...f, download_allowed: e.target.checked }))}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          Allow listeners to download this song
        </label>

        {form.download_allowed && (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="license-type" className="text-sm text-muted">
                License type
              </label>
              <select
                id="license-type"
                value={form.license_type}
                onChange={(e) => setForm((f) => ({ ...f, license_type: e.target.value as LicenseType | "" }))}
                className="h-11 rounded-card border border-line bg-surface px-3 text-sm outline-none focus:border-accent"
              >
                {LICENSE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {form.license_type === "other" && (
              <Textarea
                label="Rights note (required for 'Other')"
                maxLength={2000}
                value={form.rights_note}
                onChange={(e) => setForm((f) => ({ ...f, rights_note: e.target.value }))}
              />
            )}
          </>
        )}

        <Button type="submit" loading={busy} className="mt-1">
          <UploadCloud className="h-4 w-4" aria-hidden />
          Submit for review
        </Button>
      </form>

      <h2 className="mb-3 mt-10 flex items-center gap-2 text-lg font-bold tracking-tight">
        <Music4 className="h-4.5 w-4.5 text-accent" aria-hidden />
        My uploads
      </h2>
      {uploads === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : uploads.length === 0 ? (
        <EmptyState
          icon={<Music4 className="h-6 w-6" aria-hidden />}
          title="No uploads yet."
          message="Your submitted songs and their review status will appear here."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {uploads.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{s.title}</p>
                {s.status === "REJECTED" && s.rejection_reason && (
                  <p className="truncate text-xs text-red-300/80" title={s.rejection_reason ?? ""}>
                    {s.rejection_reason}
                  </p>
                )}
              </div>
              <span className={`shrink-0 rounded-pill px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[s.status]}`}>
                {s.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
