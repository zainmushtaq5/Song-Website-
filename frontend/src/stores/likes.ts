"use client";

import { create } from "zustand";

import { api } from "@/lib/api";
import type { Song } from "@/types/api";

interface LikesState {
  likedIds: Record<string, true>;
  loading: boolean;
  loaded: boolean;
  ensureLoaded: () => Promise<void>;
  reload: () => Promise<void>;
  reset: () => void;
  toggle: (songId: string) => Promise<boolean | null>;
}

export const useLikesStore = create<LikesState>((set, get) => ({
  likedIds: {},
  loading: false,
  loaded: false,
  reset: () => set({ likedIds: {}, loading: false, loaded: false }),
  ensureLoaded: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    try {
      const songs = await api<Song[]>("/api/users/me/likes");
      const ids: Record<string, true> = {};
      for (const s of songs) ids[s.id] = true;
      set({ likedIds: ids, loaded: true });
    } catch {
      set({ likedIds: {}, loaded: true });
    } finally {
      set({ loading: false });
    }
  },
  reload: async () => {
    set({ loaded: false });
    await get().ensureLoaded();
  },
  toggle: async (songId) => {
    try {
      const out = await api<{ liked: boolean }>(`/api/songs/${songId}/like`, { method: "POST" });
      const likedIds = { ...get().likedIds };
      if (out.liked) likedIds[songId] = true;
      else delete likedIds[songId];
      set({ likedIds });
      return out.liked;
    } catch {
      return null;
    }
  },
}));
