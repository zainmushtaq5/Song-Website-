"use client";

import { useEffect, useRef } from "react";

import { api } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/api-url";
import { usePlayerStore } from "@/stores/player";
import { PlayerBar } from "@/components/music/player-bar";
import type { Song } from "@/types/api";

/** Shared so PlayerBar can seek/control the <audio> owned by Player. */
export const audioElementRef: { current: HTMLAudioElement | null } = { current: null };

export function Player() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastRecordedRef = useRef<string | null>(null);

  const queue = usePlayerStore((s) => s.queue);
  const currentIndex = usePlayerStore((s) => s.currentIndex);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);

  const song: Song | null = currentIndex >= 0 ? (queue[currentIndex] ?? null) : null;

  // Load + play/pause sync
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !song?.audio_url) return;
    if (audio.dataset.songId !== song.id) {
      audio.src = resolveMediaUrl(song.audio_url) ?? "";
      audio.dataset.songId = song.id;
      audio.load();
    }
    if (isPlaying) {
      void audio.play().catch(() => usePlayerStore.setState({ isPlaying: false }));
      // One play-count event per song start (fire-and-forget)
      if (lastRecordedRef.current !== song.id) {
        lastRecordedRef.current = song.id;
        void api(`/api/songs/${song.id}/play`, { method: "POST", auth: false }).catch(() => {});
      }
    } else {
      audio.pause();
    }
  }, [song, isPlaying]);

  // Volume sync
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = muted ? 0 : volume;
  }, [volume, muted]);

  if (!song) return null;
  const total = duration || song.duration_sec || 0;
  audioElementRef.current = audioRef.current;

  return (
    <>
      <audio
        ref={audioRef}
        preload="metadata"
        aria-hidden
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          usePlayerStore.getState().syncTime(a.currentTime, a.duration || 0);
        }}
        onLoadedMetadata={(e) => usePlayerStore.setState({ duration: e.currentTarget.duration || 0 })}
        onEnded={() => {
          const s = usePlayerStore.getState();
          if (s.repeat === "one" && audioRef.current) {
            audioRef.current.currentTime = 0;
            void audioRef.current.play();
          } else {
            s.next();
          }
        }}
      />
      <PlayerBar song={song} total={total} isPlaying={isPlaying} />
    </>
  );
}
