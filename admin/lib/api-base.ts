/**
 * Hono API origin for admin UI (server + client).
 * Empty NEXT_PUBLIC_API_URL is treated as unset so we never fetch relative URLs
 * against Next.js (which returns 404 HTML for /admin/*).
 */
export function getApoyoApiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (raw && raw.length > 0) {
    return raw.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}
