import * as crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiKey {
  id: string;
  org_id: string;
  key_hash: string;
  label: string;
  prefix: string;
  revoked_at: Date | null;
  created_at: Date;
  last_used_at: Date | null;
}

/** Returned when creating a new API key (only time the raw key is available). */
export interface ApiKeyCreateResult {
  id: string;
  prefix: string;
  rawKey: string;
}

/** Result of a successful key validation. */
export interface ValidatedKey {
  org: import("./organization.js").Organization;
}

// ---------------------------------------------------------------------------
// Pure key generation / hashing helpers (crypto only, no DB)
// ---------------------------------------------------------------------------

const API_KEY_PREFIX = "clsc_live_";

export function generateRawKey(): string {
  return API_KEY_PREFIX + crypto.randomBytes(32).toString("hex");
}

export function hashKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
