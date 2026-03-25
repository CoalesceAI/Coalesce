import * as crypto from "node:crypto";
import { query } from "../db/pool.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Organization {
  id: string;
  slug: string;
  name: string;
  settings: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

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
  org: Organization;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_KEY_PREFIX = "clsc_live_";

function generateRawKey(): string {
  return API_KEY_PREFIX + crypto.randomBytes(32).toString("hex");
}

function hashKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// ---------------------------------------------------------------------------
// Organization CRUD
// ---------------------------------------------------------------------------

export async function getOrgBySlug(slug: string): Promise<Organization | null> {
  const result = await query<Organization>(
    `SELECT id, slug, name, settings, created_at, updated_at
       FROM organizations
      WHERE slug = $1`,
    [slug],
  );
  return result.rows[0] ?? null;
}

export async function createOrg(
  slug: string,
  name: string,
): Promise<Organization> {
  const result = await query<Organization>(
    `INSERT INTO organizations (slug, name)
     VALUES ($1, $2)
     RETURNING id, slug, name, settings, created_at, updated_at`,
    [slug, name],
  );
  const org = result.rows[0];
  if (!org) {
    throw new Error("Failed to create organization");
  }
  return org;
}

// ---------------------------------------------------------------------------
// API Key management
// ---------------------------------------------------------------------------

export async function createApiKey(
  orgId: string,
  label?: string,
): Promise<ApiKeyCreateResult> {
  const rawKey = generateRawKey();
  const keyHash = hashKey(rawKey);
  const prefix = rawKey.slice(0, 16);

  const result = await query<{ id: string }>(
    `INSERT INTO api_keys (org_id, key_hash, label, prefix)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [orgId, keyHash, label ?? "default", prefix],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to create API key");
  }

  return { id: row.id, prefix, rawKey };
}

export async function validateApiKey(raw: string): Promise<ValidatedKey | null> {
  const keyHash = hashKey(raw);

  const result = await query<{
    org_id: string;
    org_slug: string;
    org_name: string;
    org_settings: Record<string, unknown>;
    org_created_at: Date;
    org_updated_at: Date;
  }>(
    `SELECT
       o.id   AS org_id,
       o.slug AS org_slug,
       o.name AS org_name,
       o.settings AS org_settings,
       o.created_at  AS org_created_at,
       o.updated_at  AS org_updated_at
     FROM api_keys ak
     JOIN organizations o ON o.id = ak.org_id
     WHERE ak.key_hash = $1
       AND ak.revoked_at IS NULL`,
    [keyHash],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const org: Organization = {
    id: row.org_id,
    slug: row.org_slug,
    name: row.org_name,
    settings: row.org_settings,
    created_at: row.org_created_at,
    updated_at: row.org_updated_at,
  };

  return { org };
}
