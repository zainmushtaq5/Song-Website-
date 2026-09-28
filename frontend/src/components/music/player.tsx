"use client";

import { useCallback, useEffect, useRef } from "react";

import { PlayerBar } from "@/components/music/player-bar";
import { api } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/api-url";
import {
  attachAnalyser,
  isAnalyserAttached,
  markAnalyserUnavailable,
  resumeAnalyser,
} from "@/lib/audio-analyser";
import { cachedCorsDecision, probeMediaCors } from "@/lib/media-cors";
import { usePlayerStore } from "@/stores/player";
import type { Song } from "@/types/api";

/** Shared so PlayerBar can seek/control the <audio> owned by Player. */
export const audioElementRef: { current: HTMLAudioElement | null } = { current: null };

/** A load/seek that supersedes an in-flight play() is not a playback failure. */
function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function Player() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastRecordedRef = useRef<string | null>(null);
  /** Song whose non-CORS retry already ran — never loop the fallback. */
  const retriedRef = useRef<string | null>(null);

  const queue = usePlayerStore((s) => s.queue);
  const currentIndex = usePlayerStore((s) => s.currentIndex);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);

  const song: Song | null = currentIndex >= 0 ? (queue[currentIndex] ?? null) : null;

  /**
   * The element's transport state, in one place: pause is unconditional, play
   * waits until the source for this song is actually bound.
   */
  const syncTransport = useCallback(() => {
    const element = audioRef.current;
    if (!element || !song) return;

    if (!usePlayerStore.getState().isPlaying) {
      element.pause();
      return;
    }
    if (element.dataset.songId !== song.id) return; // bound in effect (1)
    resumeAnalyser();
    void element.play().catch((error: unknown) => {
      if (isAbort(error)) return;
      usePlayerStore.setState({ isPlaying: false });
    });
    if (lastRecordedRef.current !== song.id) {
      lastRecordedRef.current = song.id;
      void api(`/api/songs/${song.id}/play`, { method: "POST", auth: false }).catch(() => {});
    }
  }, [song]);

  // (1) Source selection for the current song.
  //
  // The visualizer needs the element routed through Web Audio, which is only
  // safe when the media response is CORS-enabled (see lib/media-cors.ts), and an
  // element must be told `crossOrigin` BEFORE its resource is requested — a
  // reload after an initial plain load is not equivalent (the cache entry from
  // the plain load carries no Access-Control-Allow-Origin, so the CORS reload
  // fails the check and playback dies). The verdict therefore comes first; it is
  // cached per origin, so only the first track of a session waits a round-trip.
  useEffect(() => {
    const element = audioRef.current;
    if (!element || !song?.audio_url) return;
    const url = resolveMediaUrl(song.audio_url) ?? "";
    if (!url) return;

    const songId = song.id;
    let cancelled = false;

    const bind = (corsAllowed: boolean) => {
      if (cancelled) return;
      const el = audioRef.current;
      if (!el || el.dataset.songId === songId) return; // already on this track
      if (corsAllowed) {
        el.crossOrigin = "anonymous";
        attachAnalyser(el);
      } else {
        el.removeAttribute("crossorigin");
        markAnalyserUnavailable("non-cors-media");
      }
      el.src = url;
      el.dataset.songId = songId;
      el.load();
      syncTransport(); // an idle toggle may already be waiting for this source
    };

    const decision = cachedCorsDecision(url);
    if (decision !== null) {
      bind(decision);
      return;
    }
    void probeMediaCors(url).then(bind);
    return () => {
      cancelled = true;
    };
  }, [song, syncTransport]);

  // (2) Transport: play/pause is never entangled with source selection, so a
  // pause always pauses — even while a probe for the next track is in flight.
  useEffect(() => {
    syncTransport();
  }, [song, isPlaying, syncTransport]);

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
        onError={(e) => {
          const element = e.currentTarget;
          // Last-resort guard: if a CORS-clean source still failed, play it the
          // plain way. Skipped once the element is routed through the graph,
          // where a non-CORS source would be silent anyway.
          if (!element.crossOrigin || isAnalyserAttached()) return;
          if (retriedRef.current === element.dataset.songId) return;
          retriedRef.current = element.dataset.songId ?? null;
          markAnalyserUnavailable("media-error");
          element.removeAttribute("crossorigin");
          element.load();
          if (usePlayerStore.getState().isPlaying) void element.play().catch(() => {});
        }}
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
