import * as crypto from 'node:crypto';

const DEFAULT_EXPIRY_HOURS = 24 * 365; // 1 year — long-lived for error middleware config

/**
 * Generate a signed support base URL for an organization.
 * The customer puts this URL in their error middleware config.
 * They append &endpoint=...&error_code=... at runtime.
 */
export function generateSignedBaseUrl(
  coalesceBaseUrl: string,
  orgSlug: string,
  signingSecret: string,
  expiryHours: number = DEFAULT_EXPIRY_HOURS,
): string {
  const expires = Math.floor(Date.now() / 1000) + expiryHours * 3600;
  const token = sign(orgSlug, expires, signingSecret);
  return `${coalesceBaseUrl}/support/${orgSlug}?token=${token}&expires=${expires}`;
}

/**
 * Verify a signed token from a support URL.
 * Returns the org slug if valid, null if invalid or expired.
 */
export function verifySignedUrl(
  orgSlug: string,
  token: string,
  expires: string | number,
  signingSecret: string,
): boolean {
  const expiresNum = typeof expires === 'string' ? parseInt(expires, 10) : expires;

  // Check expiry
  if (isNaN(expiresNum) || Math.floor(Date.now() / 1000) > expiresNum) {
    return false;
  }

  // Verify HMAC
  const expected = sign(orgSlug, expiresNum, signingSecret);
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

function sign(orgSlug: string, expires: number, secret: string): string {
  const payload = `${orgSlug}:${expires}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
