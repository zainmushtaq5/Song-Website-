import { ForArtistsCta } from "@/components/home/for-artists-cta";
import { Hero } from "@/components/home/hero";
import { HowItWorks } from "@/components/home/how-it-works";
import { Recommended } from "@/components/home/recommended";
import { RisingArtists } from "@/components/home/rising-artists";
import { SongSection } from "@/components/home/song-section";
import { WhyPlatform } from "@/components/home/why-platform";

export default function HomePage() {
  return (
    <div className="mt-6">
      <Hero />
      <Recommended />
      <SongSection title="Trending Now" eyebrow="Hot right now" sort="trending" />
      <SongSection title="New Releases" eyebrow="Fresh drops" sort="recent" variant="band" />
      <RisingArtists />
      <WhyPlatform />
      <HowItWorks />
      <ForArtistsCta />
    </div>
  );
}
