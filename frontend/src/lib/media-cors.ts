"use client";

/**
 * Decide once per origin whether a media URL can be loaded CORS-clean.
 *
 * The visualizer needs real samples, and a media element only hands them to
 * `createMediaElementSource` when the response carries
 * `Access-Control-Allow-Origin`. That decision has to be made BEFORE the element
 * is touched: routing a non-CORS source into the graph yields silence (and the
 * element's own output is already going through the graph, so it cannot be
 * un-routed). A failed probe therefore means "play natively, show the fallback
 * visualizer", never "break playback".
 *
 * The probe is a single byte (`Range: bytes=0-0`) of the REAL signed media URL
 * whose body is cancelled as soon as the status line is in: the CORS verdict is
 * fully decided by the response headers. HEAD would be cheaper but the media
 * route answers it with 405. Deliberately not probed via a sibling path on the
 * same origin — two paths can carry different policies (a proxy may strip the
 * headers for /media/* only), and a wrong "true" here would route tainted media
 * into the graph, i.e. silence that cannot be undone.
 *
 * Signed URLs differ per song but the policy is per origin, so results (and
 * in-flight probes) are cached per origin — one probe per session in practice,
 * which also keeps the player's play() call synchronous for every later song.
 */

const decisions = new Map<string, boolean>();
const inFlight = new Map<string, Promise<boolean>>();

function originOf(url: string): string | null {
  try {
    return new URL(url, "http://localhost").origin;
  } catch {
    return null;
  }
}

/** Synchronous answer when this origin has already been probed. */
export function cachedCorsDecision(url: string): boolean | null {
  const origin = originOf(url);
  return origin ? (decisions.get(origin) ?? null) : null;
}

export function probeMediaCors(url: string): Promise<boolean> {
  const origin = originOf(url);
  if (!origin) return Promise.resolve(false);

  const known = decisions.get(origin);
  if (known !== undefined) return Promise.resolve(known);

  const existing = inFlight.get(origin);
  if (existing) return existing;

  const probe = fetch(url, {
    method: "GET",
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
    headers: { Range: "bytes=0-0" },
  })
    .then((res) => {
      // "cors" = cross-origin and allowed, "basic" = same-origin (never tainted).
      const ok = (res.type === "cors" || res.type === "basic") && res.ok;
      // The status line is the whole answer — never stream the rest of the file.
      void res.body?.cancel().catch(() => {});
      return ok;
    })
    .catch(() => false)
    .then((ok) => {
      decisions.set(origin, ok);
      inFlight.delete(origin);
      return ok;
    });

  inFlight.set(origin, probe);
  return probe;
}
