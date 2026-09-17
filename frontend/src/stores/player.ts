"use client";

import { create } from "zustand";

import { api } from "@/lib/api";
import type { Song } from "@/types/api";

interface PlayerState {
  queue: Song[];
  currentIndex: number;
  isPlaying: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  repeat: "off" | "all" | "one";
  current: () => Song | null;
  playSong: (song: Song, queue?: Song[]) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  cycleRepeat: () => void;
  syncTime: (position: number, duration: number) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  position: 0,
  duration: 0,
  volume: 0.8,
  muted: false,
  repeat: "off",
  current: () => {
    const { queue, currentIndex } = get();
    return currentIndex >= 0 ? (queue[currentIndex] ?? null) : null;
  },
  playSong: (song, queue) => {
    const list = queue?.length ? queue : [song];
    const idx = Math.max(0, list.findIndex((s) => s.id === song.id));
    const same = get().currentIndex === idx && get().queue[idx]?.id === song.id;
    if (same) {
      set({ isPlaying: !get().isPlaying });
      return;
    }
    set({ queue: list, currentIndex: idx, isPlaying: true, position: 0, duration: song.duration_sec });
  },
  toggle: () => {
    if (get().currentIndex < 0) return;
    set({ isPlaying: !get().isPlaying });
  },
  next: () => {
    const { queue, currentIndex, repeat } = get();
    if (currentIndex < 0) return;
    if (currentIndex + 1 < queue.length) {
      set({ currentIndex: currentIndex + 1, isPlaying: true, position: 0 });
    } else if (repeat === "all" && queue.length > 0) {
      set({ currentIndex: 0, isPlaying: true, position: 0 });
    } else {
      set({ isPlaying: false, position: 0 });
    }
  },
  prev: () => {
    const { queue, currentIndex, position } = get();
    if (currentIndex < 0) return;
    if (position > 3 || currentIndex === 0) {
      set({ position: 0 });
    } else {
      set({ currentIndex: currentIndex - 1, isPlaying: true, position: 0 });
    }
  },
  setVolume: (v) => set({ volume: Math.min(1, Math.max(0, v)), muted: false }),
  toggleMute: () => set({ muted: !get().muted }),
  cycleRepeat: () =>
    set({ repeat: get().repeat === "off" ? "all" : get().repeat === "all" ? "one" : "off" }),
  syncTime: (position, duration) => set({ position, duration }),
}));
