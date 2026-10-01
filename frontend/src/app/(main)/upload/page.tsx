"use client";

import Link from "next/link";
import { Music4, UploadCloud } from "lucide-react";
import { useEffect, useState } from "react";

import { AnalyticsPanel } from "@/components/analytics/analytics-panel";
import { LicenseEditor } from "@/components/music/license-editor";
import { MetadataAutofillButton } from "@/components/music/metadata-autofill-button";
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
  EXPIRED: "bg-orange-500/15 text-orange-300",
  SUSPENDED: "bg-orange-500/15 text-orange-300",
  REMOVED: "bg-red-500/15 text-red-300",
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
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [licTick, setLicTick] = useState(0);
  const [isRequest, setIsRequest] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (user) {
      api<Song[]>("/api/songs/mine")
        .then(setUploads)
        .catch(() => setUploads([]));
    }
  }, [user, busy, licTick]);

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
    if (!isRequest && (!audio || !cover)) {
      setFileError("Both an audio file and a cover image are required for a direct upload.");
      return;
    }
    setFileError(null);
    setBusy(true);
    try {
      if (isRequest) {
        await api<Song>("/api/songs/request-song", {
          method: "POST",
          json: {
            title: form.title.trim(),
            description: form.description.trim() || undefined,
            genre: form.genre.trim() || undefined,
          },
        });
        toast("Song request submitted!", "success");
      } else {
        // 1. Get presigned URLs
        const prepareRes = await api<{
          song_id: string;
          audio_key: string;
          cover_key: string;
          audio_url: string;
          cover_url: string;
        }>("/api/songs/prepare-upload", {
          method: "POST",
          json: {
            title: form.title.trim(),
            audio_type: audio!.type || "audio/mpeg",
            cover_type: cover!.type || "image/jpeg",
          },
        });

        // 2. Upload audio to R2 directly
        const audioRes = await fetch(prepareRes.audio_url, {
          method: "PUT",
          body: audio,
          headers: { "Content-Type": audio!.type || "audio/mpeg" },
        });
        if (!audioRes.ok) throw new Error("Failed to upload audio file to storage");

        // 3. Upload cover to R2 directly
        const coverRes = await fetch(prepareRes.cover_url, {
          method: "PUT",
          body: cover,
          headers: { "Content-Type": cover!.type || "image/jpeg" },
        });
        if (!coverRes.ok) throw new Error("Failed to upload cover image to storage");

        // 4. Finalize
        await api<Song>("/api/songs/finalize-upload", {
          method: "POST",
          json: {
            song_id: prepareRes.song_id,
            title: form.title.trim(),
            description: form.description.trim() || undefined,
            genre: form.genre.trim() || undefined,
            download_allowed: form.download_allowed,
            license_type: form.download_allowed && form.license_type ? form.license_type : undefined,
            rights_note: form.rights_note.trim() || undefined,
            audio_key: prepareRes.audio_key,
            cover_key: prepareRes.cover_key,
            audio_type: audio!.type || "audio/mpeg",
            audio_size: audio!.size,
          },
        });
        toast("Upload submitted for review", "success");
      }
      setForm({ ...form, title: "", description: "", rights_note: "" });
      setAudio(null);
      setCover(null);
      setCoverPreview(null);
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

  return UploadView({
    form,
    setForm,
    audio,
    setAudio,
    cover,
    setCover,
    coverPreview,
    setCoverPreview,
    busy,
    fileError,
    uploads,
    isRequest,
    setIsRequest,
    onSubmit,
    onLicenseSaved: () => setLicTick((t) => t + 1),
  });
}

function UploadView(props: {
  form: { title: string; description: string; genre: string; download_allowed: boolean; license_type: LicenseType | ""; rights_note: string };
  setForm: (fn: (f: typeof props.form) => typeof props.form) => void;
  audio: File | null;
  setAudio: (f: File | null) => void;
  cover: File | null;
  setCover: (f: File | null) => void;
  coverPreview: string | null;
  setCoverPreview: (p: string | null) => void;
  busy: boolean;
  fileError: string | null;
  uploads: Song[] | null;
  isRequest: boolean;
  setIsRequest: (val: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  onLicenseSaved: () => void;
}) {
  const { form, audio, cover, coverPreview, setCoverPreview, busy, fileError, uploads, isRequest, setIsRequest } = props;
  const setForm = props.setForm;
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-extrabold tracking-tight">Upload a song</h1>
      <p className="mt-1 text-sm text-muted">
        Uploads are reviewed by our team before they appear on the platform. You&apos;ll only upload music you have
        the rights to distribute.
      </p>

      <form onSubmit={props.onSubmit} className="mt-6 flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
        <div className="flex items-start gap-3 rounded-card border border-accent/20 bg-accent/5 p-4">
          <input 
            type="checkbox" 
            id="is-request-toggle" 
            checked={isRequest} 
            onChange={(e) => setIsRequest(e.target.checked)}
            className="mt-1 h-4 w-4 cursor-pointer accent-accent"
          />
          <div className="flex flex-col">
            <label htmlFor="is-request-toggle" className="text-sm font-semibold cursor-pointer select-none">
              Submit as a Song Request
            </label>
            <p className="text-xs text-muted mt-0.5">
              Turn this on if you just want to request a song by name. Audio files and cover images will become optional, and the admin will upload the files for you!
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="song-title-input" className="text-sm font-medium text-ink">
              Title <span className="text-red-400">*</span>
            </label>
            <MetadataAutofillButton
              songTitle={form.title}
              audioFile={audio}
              onFill={(autofill) => {
                setForm((prev) => ({
                  ...prev,
                  title: autofill.title ?? prev.title,
                  genre: autofill.genre ?? prev.genre,
                  license_type: autofill.licenseType ?? prev.license_type,
                  download_allowed: autofill.downloadAllowed ?? prev.download_allowed,
                  description: !prev.description.trim() && autofill.description ? autofill.description : prev.description,
                }));
                if (autofill.coverFile) {
                  props.setCover(autofill.coverFile);
                  setCoverPreview(autofill.coverDataUrl ?? null);
                }
              }}
            />
          </div>
          <input
            id="song-title-input"
            required
            maxLength={200}
            placeholder="e.g. Lose Yourself, Faded, Smells Like Teen Spirit"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="h-11 rounded-card border border-line bg-surface px-3 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-accent"
          />
          <p className="text-[11px] text-muted">
            Tip: Click &quot;Auto-fill from internet&quot; to fetch genre (Hip-Hop, Rock, etc.), artwork, and royalty license.
          </p>
        </div>

        <Textarea
          label="Description (optional)"
          maxLength={5000}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
        <Input
          label="Genre (optional)"
          maxLength={80}
          placeholder="e.g. Lo-Fi, Hip-Hop, Rock, Pop"
          value={form.genre}
          onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className={`flex flex-col gap-1.5 ${isRequest ? "opacity-50 pointer-events-none" : ""}`}>
            <label htmlFor="audio-input" className="text-sm text-muted">
              Audio file (MP3, M4A, WAV — max 50 MB) {isRequest ? "(Optional)" : "*"}
            </label>
            <input
              id="audio-input"
              type="file"
              accept="audio/mpeg,audio/mp4,audio/wav,.mp3,.m4a,.wav"
              required={!isRequest}
              disabled={isRequest}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                props.setAudio(f);
                if (f && !form.title.trim()) {
                  const guess = f.name
                    .replace(/\.[^/.]+$/, "")
                    .replace(/^\d+[\s.-]+/, "")
                    .replace(/[_-]/g, " ")
                    .trim();
                  if (guess) {
                    setForm((prev) => ({ ...prev, title: guess }));
                  }
                }
              }}
              className="text-sm file:mr-3 file:rounded-pill file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:text-ink"
            />
          </div>
          <div className={`flex flex-col gap-1.5 ${isRequest ? "opacity-50 pointer-events-none" : ""}`}>
            <label htmlFor="cover-input" className="text-sm text-muted">
              Cover image (JPG, PNG, WebP — max 5 MB) {isRequest ? "(Optional)" : "*"}
            </label>
            {coverPreview ? (
              <div className="flex items-center gap-3 rounded-card border border-line bg-surface-2 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverPreview}
                  alt="Cover preview"
                  className="h-12 w-12 rounded-card object-cover border border-line shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-ink truncate">Cover artwork attached</p>
                  <p className="text-[11px] text-muted truncate">{cover?.name || "Downloaded from internet"}</p>
                  <button
                    type="button"
                    onClick={() => {
                      props.setCover(null);
                      setCoverPreview(null);
                      const el = document.getElementById("cover-input") as HTMLInputElement | null;
                      if (el) el.value = "";
                    }}
                    className="mt-0.5 text-[11px] font-medium text-accent hover:underline"
                  >
                    Change / upload custom
                  </button>
                </div>
              </div>
            ) : (
              <input
                id="cover-input"
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                required={!isRequest && !cover}
                disabled={isRequest}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  props.setCover(f);
                  if (f) {
                    setCoverPreview(URL.createObjectURL(f));
                  } else {
                    setCoverPreview(null);
                  }
                }}
                className="text-sm file:mr-3 file:rounded-pill file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:text-ink"
              />
            )}
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
          {isRequest ? "Submit Song Request" : "Submit for review"}
        </Button>
      </form>

      <AnalyticsPanel />

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
              className="flex flex-col gap-2 rounded-card border border-line bg-surface px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{s.title}</p>
                  {s.status === "REJECTED" && s.rejection_reason && (
                    <p className="truncate text-xs text-red-300/80" title={s.rejection_reason ?? ""}>
                      {s.rejection_reason}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {s.license_status && (
                    <span
                      className={`rounded-pill px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[s.license_status] ?? ""}`}
                      title="License status"
                    >
                      License: {s.license_status}
                    </span>
                  )}
                  <span className={`rounded-pill px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[s.status]}`}>
                    {s.status}
                  </span>
                </div>
              </div>
              <LicenseEditor songId={s.id} initialStatus={s.license_status} onSaved={props.onLicenseSaved} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
