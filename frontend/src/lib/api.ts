import type { User } from "@/types/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type TokenGetter = () => string | null;
type TokenRefresher = () => Promise<string | null>;

let getToken: TokenGetter = () => null;
let refresher: TokenRefresher = () => Promise.resolve(null);
let onSessionExpired: () => void = () => {};

export function configureAuth(
  deps: Partial<{ getToken: TokenGetter; refresher: TokenRefresher; onSessionExpired: () => void }>,
) {
  if (deps.getToken) getToken = deps.getToken;
  if (deps.refresher) refresher = deps.refresher;
  if (deps.onSessionExpired) onSessionExpired = deps.onSessionExpired;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  json?: unknown;
  formData?: FormData;
  auth?: boolean;
  signal?: AbortSignal;
}

async function rawRequest(path: string, opts: RequestOptions, token: string | null): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData; // browser sets multipart boundary
  } else if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  }
  return fetch(`${API_URL}${path}`, {
    method: opts.method ?? (body ? "POST" : "GET"),
    headers,
    body,
    signal: opts.signal,
  });
}

function detailFrom(resp: unknown): string {
  if (typeof resp === "object" && resp !== null && "detail" in resp) {
    const d = (resp as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      const first = d[0] as { msg?: string } | undefined;
      return first?.msg ?? "Invalid request";
    }
    return "Invalid request";
  }
  return "Something went wrong";
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const wantAuth = opts.auth ?? true;
  let resp = await rawRequest(path, opts, wantAuth ? getToken() : null);

  // Transparent single retry after refreshing an expired access token.
  if (resp.status === 401 && wantAuth && getToken()) {
    const newToken = await refresher();
    if (newToken) {
      resp = await rawRequest(path, opts, newToken);
    }
  }

  if (resp.status === 401) {
    onSessionExpired();
  }

  if (!resp.ok) {
    let detail = "Something went wrong";
    try {
      detail = detailFrom(await resp.json());
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(resp.status, detail);
  }
  return (await resp.json()) as T;
}
