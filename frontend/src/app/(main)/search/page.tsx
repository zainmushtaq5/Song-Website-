"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { SongCard } from "@/components/music/song-card";
import { Button } from "@/components/ui/button";
import { EmptyState, SkeletonCard } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import type { SearchResults } from "@/types/api";

function SearchPageContent() {
  const params = useSearchParams();
  const router = useRouter();
  const initial = params.get("q") ?? "";
  const [query, setQuery] = useState(initial);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (timer.current) clearTimeout(timer.current);
    if (q.length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(() => {
      api<SearchResults>(`/api/search?q=${encodeURIComponent(q)}`)
        .then(setResults)
        .catch(() => setResults(null))
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim().length >= 2) router.replace(`/search?q=${encodeURIComponent(query.trim())}`);
        }}
        className="flex gap-2"
        role="search"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs and artists…"
            aria-label="Search songs and artists"
            className="h-11 w-full rounded-card border border-line bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-muted/60 focus:border-accent"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <div className="mt-8">
        {loading ? (
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 5 }, (_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : results === null ? (
          <EmptyState
            icon={<Search className="h-6 w-6" aria-hidden />}
            title={query.trim().length >= 2 ? "No results found" : "Find your next sound"}
            message={
              query.trim().length >= 2
                ? `Nothing matched “${query.trim()}”. Try a different search.`
                : "Type at least two characters to search songs and artists."
            }
          />
        ) : (
          <>
            {results.artists.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-muted">Artists</h2>
                <div className="flex flex-wrap gap-2">
                  {results.artists.map((a) => (
                    <a
                      key={a.id}
                      href={`/artists/${a.slug}`}
                      className="rounded-pill border border-line bg-surface px-3.5 py-2 text-sm transition-colors hover:border-accent hover:text-accent"
                    >
                      {a.name}
                    </a>
                  ))}
                </div>
              </section>
            )}
            <section>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-muted">Songs</h2>
              {results.songs.length === 0 ? (
                <EmptyState
                  icon={<Search className="h-6 w-6" aria-hidden />}
                  title="No songs matched"
                  message={`No songs matched “${results.query}”.`}
                />
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  {results.songs.map((song) => (
                    <SongCard key={song.id} song={song} queue={results.songs} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageContent />
    </Suspense>
  );
}
