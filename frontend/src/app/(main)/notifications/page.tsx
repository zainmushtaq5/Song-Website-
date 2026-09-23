"use client";

import Link from "next/link";
import { Bell, CheckCheck, FileCheck, FileX, Music4, ShieldBan, UserRoundCheck, XCircle } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { useNotificationsStore } from "@/stores/notifications";

const ICONS = {
  song_approved: { icon: Music4, tint: "text-green-400" },
  song_rejected: { icon: XCircle, tint: "text-red-400" },
  new_follower: { icon: UserRoundCheck, tint: "text-accent" },
  license_approved: { icon: FileCheck, tint: "text-green-400" },
  license_rejected: { icon: FileX, tint: "text-red-400" },
  license_suspended: { icon: ShieldBan, tint: "text-yellow-400" },
} as const;

function timeAgo(iso: string): string {
  // SQLite (dev) stores naive UTC timestamps without a timezone marker;
  // parse those as UTC, not local, or times skew by the local UTC offset.
  const normalized = /[Z+]/.test(iso.slice(-6)) ? iso : `${iso}Z`;
  const secs = Math.max(1, Math.floor((Date.now() - new Date(normalized).getTime()) / 1000));
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function NotificationsPage() {
  const user = useAuthStore((s) => s.user);
  const items = useNotificationsStore((s) => s.items);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const load = useNotificationsStore((s) => s.load);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  if (!user) {
    return (
      <EmptyState
        icon={<Bell className="h-6 w-6" aria-hidden />}
        title="Notifications"
        message="Log in to see updates about your music and followers."
        ctaLabel="Log in"
        ctaHref="/login?next=/notifications"
      />
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">Notifications</h1>
        {unreadCount > 0 && (
          <Button variant="secondary" size="sm" onClick={() => void markAllRead()}>
            <CheckCheck className="h-4 w-4" aria-hidden />
            Mark all read
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Bell className="h-6 w-6" aria-hidden />}
            title="No notifications yet."
            message="Approvals, rejections, and new followers will show up here."
          />
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {items.map((n) => {
            const meta = ICONS[n.type];
            const Icon = meta.icon;
            return (
              <li
                key={n.id}
                className={`flex items-start gap-3 rounded-card border px-4 py-3 ${
                  n.is_read ? "border-line/60 bg-surface/50" : "border-accent/30 bg-surface"
                }`}
              >
                <Icon className={`mt-0.5 h-4.5 w-4.5 shrink-0 ${meta.tint}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${n.is_read ? "text-muted" : "text-ink"}`}>{n.message}</p>
                  <p className="mt-0.5 text-[11px] text-muted/70">{timeAgo(n.created_at)}</p>
                </div>
                {!n.is_read && (
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-pill bg-accent" aria-label="unread" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
