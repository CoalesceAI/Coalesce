// Thin wrapper around the Hono admin API.
// All requests are authenticated via the Clerk session token.
//
// NEXT_PUBLIC_API_URL must be the Hono API origin (e.g. http://localhost:3000).
// Empty string is treated as unset — otherwise fetch("/admin/...") hits Next.js and 404s.

import { getCoalesceApiBase } from "./api-base";

export class AdminApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

function looksLikeHtml(s: string): boolean {
  const t = s.trimStart().slice(0, 64).toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html");
}

function htmlWrongServerMessage(status: number): string {
  return [
    `The API returned HTML (${status}) instead of JSON.`,
    "The admin UI is calling the wrong host: requests must go to the Hono API, not Next.js.",
    `Set NEXT_PUBLIC_API_URL in admin/.env.local to your API origin (e.g. http://localhost:3000).`,
    `If it is set, ensure it is not empty and is not the Next.js dev URL.`,
  ].join(" ");
}

function buildUrl(path: string): string {
  const base = getCoalesceApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  const url = `${base}${p}`;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new AdminApiError(
      `Invalid NEXT_PUBLIC_API_URL — resolved URL is not absolute: ${url}`,
      0,
      "BAD_API_URL",
    );
  }
  return url;
}

export async function adminFetch<T>(
  path: string,
  options: RequestInit = {},
  token: string,
): Promise<T> {
  const headers = new Headers(options.headers);

  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const method = (options.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(buildUrl(path), {
    ...options,
    headers,
  });

  if (!res.ok) {
    const raw = await res.text();
    let message = res.statusText || `HTTP ${res.status}`;
    let code: string | undefined;

    if (raw) {
      if (looksLikeHtml(raw)) {
        message = htmlWrongServerMessage(res.status);
      } else {
        try {
          const body = JSON.parse(raw) as { error?: string; message?: string; code?: string };
          message =
            (typeof body.error === "string" && body.error) ||
            (typeof body.message === "string" && body.message) ||
            message;
          code = typeof body.code === "string" ? body.code : undefined;
        } catch {
          message = raw.slice(0, 500);
        }
      }
    }

    if (res.status === 401) {
      message = `${message} — Check that the API server has the same CLERK_SECRET_KEY as your Clerk app.`;
    }

    throw new AdminApiError(message, res.status, code);
  }

  const text = await res.text();
  if (!text.trim()) {
    throw new AdminApiError("Empty response from API", res.status);
  }

  if (looksLikeHtml(text)) {
    throw new AdminApiError(htmlWrongServerMessage(res.status), res.status, "HTML_RESPONSE");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AdminApiError("Response was not valid JSON", res.status);
  }
}
