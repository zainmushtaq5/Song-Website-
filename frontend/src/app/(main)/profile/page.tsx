"use client";

import Link from "next/link";
import { Heart, LogOut, Music4, ShieldCheck, UserRound, UserRoundCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { resolveMediaUrl } from "@/lib/api-url";
import { api } from "@/lib/api";
import { logout as authLogout, useAuthStore } from "@/stores/auth";
import { useFollowsStore } from "@/stores/follows";
import { useLikesStore } from "@/stores/likes";
import type { ArtistPublic, MyProfile } from "@/types/api";

export default function ProfilePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const likeCount = Object.keys(useLikesStore((s) => s.likedIds)).length;
  const followedArtistIds = useFollowsStore((s) => s.followedArtistIds);
  const [mounted, setMounted] = useState(false);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [following, setFollowing] = useState<ArtistPublic[] | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (user) {
      api<MyProfile>("/api/auth/me")
        .then(setProfile)
        .catch(() => setProfile(null));
      api<ArtistPublic[]>("/api/users/me/following")
        .then(setFollowing)
        .catch(() => setFollowing([]));
    }
  }, [user]);

  if (!mounted) return null;

  if (!user) {
    return (
      <EmptyState
        icon={<UserRound className="h-6 w-6" aria-hidden />}
        title="Your profile"
        message="Log in to view your account."
        ctaLabel="Log in"
        ctaHref="/login?next=/profile"
      />
    );
  }

  const shown = profile ?? user;

  return (
    <div className="mx-auto max-w-lg">
      <div className="flex items-center gap-4 rounded-card border border-line bg-surface p-5">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-pill border border-line bg-surface-2">
          {shown.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- dynamic URL
            <img
              src={resolveMediaUrl(shown.avatar_url) ?? undefined}
              alt={`${shown.username} avatar`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-accent" aria-hidden>
              <UserRound className="h-7 w-7" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold tracking-tight">{shown.username}</h1>
          <p className="truncate text-sm text-muted">{shown.email}</p>
          <p className="mt-1 text-xs uppercase tracking-widest text-muted">
            {shown.role === "ADMIN" ? "Admin" : shown.role === "ARTIST" ? "Artist" : "Listener"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-4">
          <Heart className="h-4.5 w-4.5 text-accent" aria-hidden />
          <div>
            <p className="text-lg font-extrabold leading-none">{likeCount}</p>
            <p className="text-xs text-muted">Liked songs</p>
          </div>
        </div>
        <Link
          href="/upload"
          className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 transition-colors hover:border-accent"
        >
          <Music4 className="h-4.5 w-4.5 text-accent" aria-hidden />
          <div>
            <p className="text-sm font-bold leading-tight">My uploads</p>
            <p className="text-xs text-muted">Manage songs</p>
          </div>
        </Link>
      </div>

      {shown.role === "ADMIN" && (
        <Link
          href="/admin"
          className="mt-3 flex items-center gap-3 rounded-card border border-line bg-surface p-4 transition-colors hover:border-accent"
        >
          <ShieldCheck className="h-4.5 w-4.5 text-accent" aria-hidden />
          <div>
            <p className="text-sm font-bold leading-tight">Review queue</p>
            <p className="text-xs text-muted">Admin tools</p>
          </div>
        </Link>
      )}

      {/* Following */}
      <h2 className="mb-3 mt-8 flex items-center gap-2 text-base font-bold tracking-tight">
        <UserRoundCheck className="h-4.5 w-4.5 text-accent" aria-hidden />
        Following
      </h2>
      {following === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : following.length === 0 ? (
        <EmptyState
          icon={<UserRoundCheck className="h-6 w-6" aria-hidden />}
          title="Not following anyone yet."
          message="Follow artists you love to keep up with their new releases."
          ctaLabel="Explore artists"
          ctaHref="/"
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {following.map((a) => (
            <li key={a.id}>
              <Link
                href={`/artists/${a.slug}`}
                className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-2.5 transition-colors hover:border-accent/50"
              >
                <span className="h-9 w-9 shrink-0 overflow-hidden rounded-pill border border-line bg-surface-2">
                  {a.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- dynamic URL
                    <img
                      src={resolveMediaUrl(a.avatar_url) ?? undefined}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-accent" aria-hidden>
                      <UserRound className="h-4 w-4" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{a.name}</span>
                {followedArtistIds[a.id] && (
                  <span className="shrink-0 text-[11px] text-muted">following</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Button
        variant="danger"
        className="mt-6 w-full"
        onClick={async () => {
          try {
            await api("/api/auth/logout", { method: "POST" });
          } catch {
            // clear locally even if server call fails
          }
          authLogout();
          router.push("/");
        }}
      >
        <LogOut className="h-4 w-4" aria-hidden />
        Log out
      </Button>
    </div>
  );
}
