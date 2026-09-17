"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { api, configureAuth } from "@/lib/api";
import { useFollowsStore } from "@/stores/follows";
import { useLikesStore } from "@/stores/likes";
import type { User } from "@/types/api";

interface Tokens {
  access_token: string;
  refresh_token: string;
}

interface AuthState {
  user: User | null;
  tokens: Tokens | null;
  setSession: (user: User | null, tokens: Tokens) => void;
  setUser: (user: User) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      setSession: (user, tokens) => set({ user, tokens }),
      setUser: (user) => set({ user }),
      clear: () => set({ user: null, tokens: null }),
    }),
    { name: "songs-auth" },
  ),
);

async function refreshAccessToken(): Promise<string | null> {
  const { tokens, setSession, clear } = useAuthStore.getState();
  if (!tokens) return null;
  try {
    const out = await api<{ access_token: string }>("/api/auth/refresh", {
      json: { refresh_token: tokens.refresh_token },
      auth: false,
    });
    const newTokens = { ...tokens, access_token: out.access_token };
    setSession(useAuthStore.getState().user, newTokens);
    return newTokens.access_token;
  } catch {
    clear();
    return null;
  }
}

let configured = false;
export function ensureAuthConfigured() {
  if (configured) return;
  configured = true;
  configureAuth({
    getToken: () => useAuthStore.getState().tokens?.access_token ?? null,
    refresher: refreshAccessToken,
    onSessionExpired: () => useAuthStore.getState().clear(),
  });
}

export async function register(input: {
  email: string;
  username: string;
  password: string;
  is_artist?: boolean;
}): Promise<void> {
  const out = await api<{ access_token: string; refresh_token: string }>("/api/auth/register", {
    json: input,
    auth: false,
  });
  useAuthStore.getState().setSession(null, out);
  const me = await api<User>("/api/auth/me");
  useAuthStore.getState().setSession(me, out);
}

export async function login(email: string, password: string): Promise<void> {
  const out = await api<{ access_token: string; refresh_token: string }>("/api/auth/login", {
    json: { email, password },
    auth: false,
  });
  useAuthStore.getState().setSession(null, out);
  const me = await api<User>("/api/auth/me");
  useAuthStore.getState().setSession(me, out);
  void useLikesStore.getState().reload();
}

/**
 * Silent boot-time session validation: if a stored token exists (possibly stale
 * from a previous session/DB), revalidate it once. On failure, clear the session
 * so the login form is never blocked by leftover state. Never surfaces an error.
 */
export async function validateSession(): Promise<void> {
  const { tokens, setUser, clear } = useAuthStore.getState();
  if (!tokens) return;
  try {
    const me = await api<User>("/api/auth/me");
    setUser(me);
  } catch {
    clear();
    useLikesStore.getState().reset();
    useFollowsStore.getState().reset();
  }
}

export function logout(): void {
  useAuthStore.getState().clear();
  useLikesStore.getState().reset();
  useFollowsStore.getState().reset();
}
