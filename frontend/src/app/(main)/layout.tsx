import { Footer } from "@/components/layout/footer";
import { Navbar, MobileNav } from "@/components/layout/navbar";
import { Player } from "@/components/music/player";
import { Toaster } from "@/components/ui/toaster";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="mx-auto min-h-dvh max-w-6xl px-4 pb-40 pt-6 sm:px-6 sm:pb-28">{children}</main>
      <Footer />
      <Player />
      <MobileNav />
      <Toaster />
    </>
  );
}
