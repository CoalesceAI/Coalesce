import { query } from "../db/pool.js";
import type { Organization } from "../domain/organization.js";

// ---------------------------------------------------------------------------
// Organization CRUD
// ---------------------------------------------------------------------------

export async function listOrgs(): Promise<Organization[]> {
  const result = await query<Organization>(
    `SELECT id, slug, name, settings, signing_secret, created_at, updated_at
       FROM organizations
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC`,
    [],
  );
  return result.rows;
}

export async function getOrgBySlug(slug: string): Promise<Organization | null> {
  const result = await query<Organization>(
    `SELECT id, slug, name, settings, signing_secret, created_at, updated_at, deleted_at
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
     RETURNING id, slug, name, settings, signing_secret, created_at, updated_at`,
    [slug, name],
  );
  const org = result.rows[0];
  if (!org) {
    throw new Error("Failed to create organization");
  }
  return org;
}

export async function updateOrg(
  slug: string,
  updates: { name?: string; settings?: Record<string, unknown> },
): Promise<Organization | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${idx++}`);
    values.push(updates.name);
  }
  if (updates.settings !== undefined) {
    setClauses.push(`settings = $${idx++}`);
    values.push(JSON.stringify(updates.settings));
  }

  if (setClauses.length === 0) return getOrgBySlug(slug);

  setClauses.push(`updated_at = now()`);
  values.push(slug);

  const result = await query<Organization>(
    `UPDATE organizations SET ${setClauses.join(", ")}
     WHERE slug = $${idx} AND deleted_at IS NULL
     RETURNING id, slug, name, settings, signing_secret, created_at, updated_at`,
    values,
  );
  return result.rows[0] ?? null;
}

export async function rotateSigningSecret(slug: string): Promise<string | null> {
  const result = await query<{ signing_secret: string }>(
    `UPDATE organizations
     SET signing_secret = encode(gen_random_bytes(32), 'hex'), updated_at = now()
     WHERE slug = $1 AND deleted_at IS NULL
     RETURNING signing_secret`,
    [slug],
  );
  return result.rows[0]?.signing_secret ?? null;
}

export async function softDeleteOrg(slug: string): Promise<boolean> {
  const result = await query(
    `UPDATE organizations SET deleted_at = now()
      WHERE slug = $1 AND deleted_at IS NULL`,
    [slug],
  );
  return (result.rowCount ?? 0) > 0;
}
