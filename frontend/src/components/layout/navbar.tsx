"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Library, LogOut, Music2, Search, Upload, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { InstallAppButton } from "@/components/pwa/install-prompt";
import { logout, useAuthStore } from "@/stores/auth";

const links = [
  { href: "/", label: "Discover" },
  { href: "/search", label: "Search" },
  { href: "/library", label: "Library" },
];

export function Navbar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isAdmin = mounted && user?.role === "ADMIN";

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/85 pt-[var(--safe-t)] backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight" aria-label="Songs home">
          <span className="flex h-8 w-8 items-center justify-center rounded-card bg-accent text-white">
            <Music2 className="h-4.5 w-4.5" aria-hidden />
          </span>
          <span className="text-base">Songs</span>
        </Link>

        <div className="hidden items-center gap-1 sm:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? "page" : undefined}
              className={`rounded-pill px-3 py-1.5 text-sm transition-colors ${
                pathname === l.href ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          ))}
          {mounted && user && (
            <Link
              href="/upload"
              className={`rounded-pill px-3 py-1.5 text-sm transition-colors ${
                pathname === "/upload" ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface hover:text-ink"
              }`}
            >
              Upload
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/admin"
              className={`rounded-pill px-3 py-1.5 text-sm transition-colors ${
                pathname === "/admin" ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface hover:text-ink"
              }`}
            >
              Admin
            </Link>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <InstallAppButton />
          {mounted && user && <NotificationBell />}
          {mounted && user ? (
            <>
              <Link
                href="/profile"
                className="flex items-center gap-2 rounded-pill bg-surface px-2.5 py-1.5 text-sm transition-colors hover:bg-surface-2"
                aria-label={`Profile: ${user.username}`}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-pill bg-accent/20 text-accent">
                  <UserRound className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="hidden max-w-28 truncate sm:inline">{user.username}</span>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                ariaLabel="Log out"
                onClick={() => {
                  logout();
                  window.location.href = "/";
                }}
              >
                <LogOut className="h-4 w-4" aria-hidden />
              </Button>
            </>
          ) : mounted ? (
            <>
              <Button href="/login" variant="ghost" size="sm">
                Log in
              </Button>
              <Button href="/register" size="sm">
                Join
              </Button>
            </>
          ) : (
            <div className="h-9 w-40" aria-hidden />
          )}
        </div>
      </nav>
    </header>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const items = [
    { href: "/", label: "Home", icon: Music2 },
    { href: "/search", label: "Search", icon: Search },
    { href: "/library", label: "Library", icon: Library },
    mounted && user
      ? { href: "/profile", label: "Profile", icon: UserRound }
      : { href: "/login", label: "Log in", icon: UserRound },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-bg/95 backdrop-blur sm:hidden"
      aria-label="Mobile navigation"
    >
      <div className="grid h-[calc(3.5rem+var(--safe-b))] grid-cols-4 pb-[var(--safe-b)]">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-0.5 text-[11px] transition-colors ${
              pathname === item.href ? "text-accent" : "text-muted"
            }`}
          >
            <item.icon className="h-5 w-5" aria-hidden />
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
