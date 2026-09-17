export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Backend signed-media URLs may be relative ("/media/...") when no CDN_URL is
 * configured (local dev). Prefix them with the backend origin so they resolve
 * against :8000, not the frontend origin. Absolute URLs (R2/CDN) pass through.
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}
