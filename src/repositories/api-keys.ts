import { query } from "../db/pool.js";
import type { Organization } from "../domain/organization.js";
import type { ApiKeyCreateResult, ValidatedKey } from "../domain/api-key.js";
import { generateRawKey, hashKey } from "../domain/api-key.js";

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

export async function listOrgApiKeys(orgId: string): Promise<Pick<import('../domain/api-key.js').ApiKey, 'id' | 'prefix' | 'label' | 'created_at' | 'revoked_at'>[]> {
  const result = await query<{
    id: string;
    prefix: string;
    label: string;
    created_at: Date;
    revoked_at: Date | null;
  }>(
    `SELECT id, prefix, label, created_at, revoked_at
       FROM api_keys
      WHERE org_id = $1
      ORDER BY created_at DESC`,
    [orgId],
  );
  return result.rows;
}

export async function revokeApiKey(id: string, orgId: string): Promise<boolean> {
  const result = await query(
    `UPDATE api_keys SET revoked_at = now()
      WHERE id = $1 AND org_id = $2 AND revoked_at IS NULL`,
    [id, orgId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function validateApiKey(raw: string): Promise<ValidatedKey | null> {
  const keyHash = hashKey(raw);

  const result = await query<{
    org_id: string;
    org_slug: string;
    org_name: string;
    org_settings: Record<string, unknown>;
    org_signing_secret: string;
    org_created_at: Date;
    org_updated_at: Date;
  }>(
    `SELECT
       o.id   AS org_id,
       o.slug AS org_slug,
       o.name AS org_name,
       o.settings AS org_settings,
       o.signing_secret AS org_signing_secret,
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
    signing_secret: row.org_signing_secret,
    created_at: row.org_created_at,
    updated_at: row.org_updated_at,
  };

  return { org };
}
