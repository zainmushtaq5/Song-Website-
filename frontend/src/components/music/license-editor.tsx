"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";
import type { LicenseInfo, LicenseType } from "@/types/api";

const LICENSE_OPTIONS: { value: LicenseType | ""; label: string }[] = [
  { value: "artist_owned", label: "I own this recording (artist-owned)" },
  { value: "royalty_free", label: "Royalty-free" },
  { value: "cc_by", label: "Creative Commons CC BY" },
  { value: "other", label: "Other (proof link required)" },
];

interface LicenseEditorProps {
  songId: string;
  initialStatus: LicenseInfo["status"] | null;
  onSaved: () => void;
}

/** Artist-side rights form for one song's license. Any edit resets review to PENDING. */
export function LicenseEditor({ songId, initialStatus, onSaved }: LicenseEditorProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [form, setForm] = useState({
    license_type: "artist_owned" as LicenseType | "",
    rights_holder: "",
    proof_reference: "",
    effective_until: "",
  });

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !license) {
      try {
        const lic = await api<LicenseInfo>(`/api/songs/${songId}/license`);
        setLicense(lic);
        setForm({
          license_type: (lic.license_type ?? "artist_owned") as LicenseType | "",
          rights_holder: lic.rights_holder ?? "",
          proof_reference: lic.proof_reference ?? "",
          effective_until: lic.effective_until ? lic.effective_until.slice(0, 10) : "",
        });
      } catch {
        toast("Failed to load license", "error");
        setOpen(false);
      }
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.license_type) return;
    setBusy(true);
    try {
      await api<LicenseInfo>(`/api/songs/${songId}/license`, {
        method: "PUT",
        json: {
          license_type: form.license_type,
          rights_holder: form.rights_holder.trim(),
          proof_reference: form.proof_reference.trim() || null,
          effective_until: form.effective_until ? `${form.effective_until}T23:59:59Z` : null,
        },
      });
      toast("License submitted for review", "success");
      onSaved();
      setOpen(false);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to update license", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => void toggle()}>
        License & rights
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-2 flex w-full flex-col gap-3 rounded-card border border-line bg-surface p-4"
    >
      <p className="text-xs text-muted">
        Status: <span className="font-semibold">{license?.status ?? initialStatus ?? "—"}</span>
        {license?.action_reason && ` — ${license.action_reason}`}
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`lic-type-${songId}`} className="text-sm text-muted">
          License type
        </label>
        <select
          id={`lic-type-${songId}`}
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
      <Input
        label="Rights holder"
        value={form.rights_holder}
        onChange={(e) => setForm((f) => ({ ...f, rights_holder: e.target.value }))}
        placeholder="Legal name of the rights holder"
      />
      <Input
        label="Proof reference (URL or document ID)"
        value={form.proof_reference}
        onChange={(e) => setForm((f) => ({ ...f, proof_reference: e.target.value }))}
        placeholder="https://…"
      />
      <Input
        label="License valid until (optional)"
        type="date"
        value={form.effective_until}
        onChange={(e) => setForm((f) => ({ ...f, effective_until: e.target.value }))}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={busy}>
          Submit for review
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}