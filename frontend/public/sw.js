/**
 * Songs service worker — offline *UI shell* only.
 *
 * Deliberately narrow in scope:
 *  • precaches the `/offline` shell + icon set at install time
 *  • navigations: network-first, falling back to the cached copy of that URL and
 *    finally to the precached `/offline` shell
 *  • `/_next/static/*` + `/icons/*`: cache-first (content-hashed/immutable)
 *  • audio, video and Range requests, the backend origin, `/api/*` and Next's RSC
 *    payload requests are never intercepted — streaming and playback stay online,
 *    which is why there is no offline playback in this build.
 */
const VERSION = "v1";
const SHELL_CACHE = `songs-shell-${VERSION}`;
const RUNTIME_CACHE = `songs-runtime-${VERSION}`;
const STATIC_CACHE = `songs-static-${VERSION}`;
const OFFLINE_URL = "/offline";
const RUNTIME_LIMIT = 24;

const PRECACHE = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
];

/**
 * Caches the offline shell *plus every static asset it references*.
 *
 * Scraping the shell's own HTML keeps this honest without a build-time manifest:
 * without its JS/CSS chunks the shell renders but cannot hydrate, which the user
 * sees as a blank "Application error" page instead of the offline UI.
 */
async function precacheOfflineShell(cache) {
  const response = await fetch(new Request(OFFLINE_URL, { cache: "reload" }));
  if (!response.ok) throw new Error(`offline shell responded ${response.status}`);
  const html = await response.clone().text();
  await cache.put(OFFLINE_URL, response);

  const assets = [...new Set([...html.matchAll(/\/_next\/static\/[^"'\\\s<>]+/g)].map((match) => match[0]))];
  await Promise.all(
    assets.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: "reload" }));
      } catch (error) {
        console.warn("[sw] offline asset skipped", url, error);
      }
    }),
  );
  return assets.length;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually guarded: one bad entry must not abort the whole install.
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: "reload" }));
          } catch (error) {
            console.warn("[sw] precache skipped", url, error);
          }
        }),
      );
      try {
        await precacheOfflineShell(cache);
      } catch (error) {
        console.warn("[sw] offline shell precache failed", error);
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith("songs-") && !key.endsWith(VERSION)).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING" || event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

/* ── routing ──────────────────────────────────────────────────────────────── */

/**
 * Marks a response as cache-served. Doubles as the offline test signal: a document
 * carrying this header did *not* touch the network, which is provable even while
 * the browser's own `navigator.onLine` flag lags behind.
 */
function fromCache(response) {
  const headers = new Headers(response.headers);
  headers.set("x-songs-cache", "sw-cache");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isImmutableAsset(pathname) {
  return pathname.startsWith("/_next/static/") || pathname.startsWith("/icons/");
}

/** Keeps a cache bounded so navigation HTML cannot grow without limit. */
async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((key) => cache.delete(key)));
}

async function cachePut(cacheName, request, response) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response);
    if (cacheName === RUNTIME_CACHE) await trim(cacheName, RUNTIME_LIMIT);
  } catch (error) {
    console.warn("[sw] cache put failed", request.url, error);
  }
}

async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    // Only successful, same-origin HTML documents are worth replaying offline.
    if (response.ok && response.type === "basic") {
      await cachePut(RUNTIME_CACHE, request, response.clone());
    }
    return response;
  } catch {
    // Replay the last good copy of *this* URL when we have one.
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return fromCache(cached);

    // Otherwise hand over to the precached shell *by URL*. Serving the shell's
    // document at an arbitrary route breaks Next hydration (its script chunks and
    // RSC payload belong to /offline), which shows up as a client-side exception.
    const shell = await caches.match(OFFLINE_URL);
    if (shell) return Response.redirect(new URL(OFFLINE_URL, self.location.origin).href, 302);

    return new Response(
      "<!doctype html><meta charset=utf-8><title>Offline</title><body style=\"font-family:system-ui;background:#0a0a0d;color:#e9e9f2;padding:2rem\">You are offline.</body>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return fromCache(cached);
  const response = await fetch(request);
  if (response.ok) await cachePut(STATIC_CACHE, request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) await cachePut(STATIC_CACHE, request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached ?? (await network) ?? Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // backend API / media / CDN stay untouched
  if (url.pathname === "/sw.js" || url.pathname.startsWith("/api/")) return;
  if (url.searchParams.has("_rsc")) return; // React Server Component payloads are freshness-critical
  if (request.headers.has("range") || request.destination === "audio" || request.destination === "video") return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (isImmutableAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.destination === "image" || request.destination === "font" || request.destination === "style") {
    event.respondWith(staleWhileRevalidate(request));
  }
});
