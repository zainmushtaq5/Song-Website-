"use client";

import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminQueue } from "@/components/music/admin-queue";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import type { Song } from "@/types/api";

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const [mounted, setMounted] = useState(false);
  const [pending, setPending] = useState<Song[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!user) return;
    api<Song[]>("/api/admin/songs?review_status=PENDING")
      .then(setPending)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load review queue");
        setPending([]);
      });
  }, [user]);

  if (!mounted) return null;

  if (!user) {
    return (
      <EmptyState
        icon={<ShieldCheck className="h-6 w-6" aria-hidden />}
        title="Admin access"
        message="Log in with an admin account to review submissions."
        ctaLabel="Log in"
        ctaHref="/login?next=/admin"
      />
    );
  }
  if (user.role !== "ADMIN") {
    return (
      <EmptyState
        icon={<ShieldCheck className="h-6 w-6" aria-hidden />}
        title="Not authorized"
        message="This area is restricted to admins."
      />
    );
  }

  return <AdminQueue pending={pending} error={error} setPending={setPending} />;
}
