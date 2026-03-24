import * as crypto from "node:crypto";
import { query } from "../db/pool.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export interface ApiKey {
  id: string;
  tenant_id: string;
  key_hash: string;
  label: string;
  active: boolean;
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
  tenant: Tenant;
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
// Tenant CRUD
// ---------------------------------------------------------------------------

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const result = await query<Tenant>(
    `SELECT id, slug, name, settings, created_at, updated_at
       FROM tenants
      WHERE slug = $1`,
    [slug],
  );
  return result.rows[0] ?? null;
}

export async function createTenant(
  slug: string,
  name: string,
): Promise<Tenant> {
  const result = await query<Tenant>(
    `INSERT INTO tenants (slug, name)
     VALUES ($1, $2)
     RETURNING id, slug, name, created_at, updated_at`,
    [slug, name],
  );
  const tenant = result.rows[0];
  if (!tenant) {
    throw new Error("Failed to create tenant");
  }
  return tenant;
}

// ---------------------------------------------------------------------------
// API Key management
// ---------------------------------------------------------------------------

export async function createApiKey(
  tenantId: string,
  label?: string,
): Promise<ApiKeyCreateResult> {
  const rawKey = generateRawKey();
  const keyHash = hashKey(rawKey);
  const prefix = rawKey.slice(0, 16);

  const result = await query<{ id: string }>(
    `INSERT INTO api_keys (tenant_id, key_hash, label)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [tenantId, keyHash, label ?? "default"],
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
    tenant_id: string;
    tenant_slug: string;
    tenant_name: string;
    tenant_created_at: Date;
    tenant_updated_at: Date;
  }>(
    `SELECT
       t.id   AS tenant_id,
       t.slug AS tenant_slug,
       t.name AS tenant_name,
       t.created_at  AS tenant_created_at,
       t.updated_at  AS tenant_updated_at
     FROM api_keys ak
     JOIN tenants t ON t.id = ak.tenant_id
     WHERE ak.key_hash = $1
       AND ak.active = true`,
    [keyHash],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const tenant: Tenant = {
    id: row.tenant_id,
    slug: row.tenant_slug,
    name: row.tenant_name,
    created_at: row.tenant_created_at,
    updated_at: row.tenant_updated_at,
  };

  return { tenant };
}
