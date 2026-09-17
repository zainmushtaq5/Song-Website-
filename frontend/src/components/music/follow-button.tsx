"use client";

import { UserCheck, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth";
import { useFollowsStore } from "@/stores/follows";
import { toast } from "@/stores/toast";

interface FollowButtonProps {
  artistId: string;
  artistSlug: string;
  size?: "sm" | "md";
  /** Called after a successful toggle with the new following state. */
  onToggled?: (following: boolean) => void;
}

export function FollowButton({ artistId, artistSlug, size = "md", onToggled }: FollowButtonProps) {
  const user = useAuthStore((s) => s.user);
  const followedArtistIds = useFollowsStore((s) => s.followedArtistIds);
  const ensureLoaded = useFollowsStore((s) => s.ensureLoaded);
  const toggle = useFollowsStore((s) => s.toggle);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) void ensureLoaded();
  }, [user, ensureLoaded]);

  const following = followedArtistIds[artistId] === true;

  async function onToggle() {
    if (!user) {
      toast("Log in to follow artists", "info");
      return;
    }
    setBusy(true);
    const result = await toggle(artistSlug);
    setBusy(false);
    if (result === null) {
      toast("Could not update follow — try again", "error");
      return;
    }
    onToggled?.(result);
    toast(result ? "Following artist" : "Unfollowed artist", "success");
  }

  return (
    <Button
      variant={following ? "secondary" : "primary"}
      size={size}
      loading={busy}
      onClick={onToggle}
      ariaLabel={following ? `Unfollow artist` : "Follow artist"}
      aria-pressed={following}
    >
      {following ? (
        <UserCheck className="h-4 w-4" aria-hidden />
      ) : (
        <UserPlus className="h-4 w-4" aria-hidden />
      )}
      {following ? "Following" : "Follow"}
    </Button>
  );
}
