"use client";

import { create } from "zustand";

import { api } from "@/lib/api";
import type { ArtistPublic } from "@/types/api";

interface FollowsState {
  followedArtistIds: Record<string, true>;
  loaded: boolean;
  loading: boolean;
  ensureLoaded: () => Promise<void>;
  reload: () => Promise<void>;
  reset: () => void;
  toggle: (artistSlug: string) => Promise<boolean | null>;
}

export const useFollowsStore = create<FollowsState>((set, get) => ({
  followedArtistIds: {},
  loaded: false,
  loading: false,
  ensureLoaded: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    try {
      const artists = await api<ArtistPublic[]>("/api/users/me/following");
      const ids: Record<string, true> = {};
      for (const a of artists) ids[a.id] = true;
      set({ followedArtistIds: ids, loaded: true });
    } catch {
      set({ followedArtistIds: {}, loaded: true });
    } finally {
      set({ loading: false });
    }
  },
  reload: async () => {
    set({ loaded: false });
    await get().ensureLoaded();
  },
  reset: () => set({ followedArtistIds: {}, loading: false, loaded: false }),
  toggle: async (artistSlug) => {
    try {
      const out = await api<{ following: boolean }>(`/api/artists/${artistSlug}/follow`, {
        method: "POST",
      });
      // re-sync ids from the server list to keep slugs/ids consistent
      const artists = await api<ArtistPublic[]>("/api/users/me/following");
      const ids: Record<string, true> = {};
      for (const a of artists) ids[a.id] = true;
      set({ followedArtistIds: ids });
      return out.following;
    } catch {
      return null;
    }
  },
}));
