"use client";

import { create } from "zustand";

import { api } from "@/lib/api";
import type { NotificationItem } from "@/types/api";

interface NotificationsState {
  items: NotificationItem[];
  unreadCount: number;
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
  markAllRead: () => Promise<void>;
  reset: () => void;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  items: [],
  unreadCount: 0,
  loaded: false,
  loading: false,
  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const out = await api<{ unread_count: number; notifications: NotificationItem[] }>(
        "/api/notifications"
      );
      set({ items: out.notifications, unreadCount: out.unread_count, loaded: true });
    } catch {
      set({ items: [], unreadCount: 0, loaded: true });
    } finally {
      set({ loading: false });
    }
  },
  markAllRead: async () => {
    try {
      await api("/api/notifications/read-all", { method: "POST" });
      set({ items: get().items.map((n) => ({ ...n, is_read: true })), unreadCount: 0 });
    } catch {
      /* keep silent — bell badge retries on next poll */
    }
  },
  reset: () => set({ items: [], unreadCount: 0, loaded: false, loading: false }),
}));
