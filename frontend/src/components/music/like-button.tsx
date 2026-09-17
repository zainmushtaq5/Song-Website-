"use client";

import { Heart } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/format";
import { useAuthStore } from "@/stores/auth";
import { useLikesStore } from "@/stores/likes";
import { toast } from "@/stores/toast";

interface LikeButtonProps {
  songId: string;
  likeCount: number;
}

export function LikeButton({ songId, likeCount }: LikeButtonProps) {
  const user = useAuthStore((s) => s.user);
  const likedIds = useLikesStore((s) => s.likedIds);
  const ensureLoaded = useLikesStore((s) => s.ensureLoaded);
  const toggle = useLikesStore((s) => s.toggle);
  const [delta, setDelta] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) void ensureLoaded();
  }, [user, ensureLoaded]);

  const liked = likedIds[songId] === true;

  async function onLike() {
    if (!user) {
      toast("Log in to like songs", "info");
      return;
    }
    setBusy(true);
    const result = await toggle(songId);
    setBusy(false);
    if (result === null) {
      toast("Could not update like — try again", "error");
      return;
    }
    setDelta((d) => d + (result ? 1 : -1));
    toast(result ? "Added to your liked songs" : "Removed from liked songs", "success");
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      loading={busy}
      onClick={onLike}
      ariaLabel={liked ? "Unlike song" : "Like song"}
      aria-pressed={liked}
      className={liked ? "text-accent" : ""}
    >
      <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} aria-hidden />
      {likeCount + delta > 0 && <span className="sr-only">{formatCount(likeCount + delta)} likes</span>}
    </Button>
  );
}
