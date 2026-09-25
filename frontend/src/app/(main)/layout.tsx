import { Footer } from "@/components/layout/footer";
import { Navbar, MobileNav } from "@/components/layout/navbar";
import { Player } from "@/components/music/player";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { Toaster } from "@/components/ui/toaster";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <OfflineBanner />
      {/* pb clears the fixed player bar + mobile nav, plus any home-indicator inset. */}
      <main className="mx-auto min-h-dvh max-w-6xl px-4 pb-[calc(10rem+var(--safe-b))] pt-6 sm:px-6 sm:pb-[calc(7rem+var(--safe-b))]">
        {children}
      </main>
      <Footer />
      <Player />
      <MobileNav />
      <InstallPrompt />
      <Toaster />
    </>
  );
}
