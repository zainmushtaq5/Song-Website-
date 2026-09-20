"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect } from "react";

import { useAuthStore } from "@/stores/auth";
import { useNotificationsStore } from "@/stores/notifications";

/** Bell icon with unread badge; polls the API every 30s while logged in. */
export function NotificationBell() {
  const user = useAuthStore((s) => s.user);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const load = useNotificationsStore((s) => s.load);
  const reset = useNotificationsStore((s) => s.reset);

  useEffect(() => {
    if (!user) {
      reset();
      return;
    }
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [user, load, reset]);

  if (!user) return null;

  return (
    <Link
      href="/notifications"
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
      className="relative flex h-9 w-9 items-center justify-center rounded-card text-muted transition-colors hover:bg-surface-2 hover:text-ink"
    >
      <Bell className="h-4.5 w-4.5" aria-hidden />
      {unreadCount > 0 && (
        <span
          data-testid="unread-badge"
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-pill bg-accent px-1 text-[10px] font-bold text-white"
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
