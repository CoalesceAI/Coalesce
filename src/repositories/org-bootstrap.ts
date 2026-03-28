import { createHash, randomBytes } from "node:crypto";
import { getClient } from "../db/pool.js";
import type { Organization } from "../domain/organization.js";
import { listUserOrgs, type OrgWithRole } from "./organization-members.js";

// ---------------------------------------------------------------------------
// First-time user: create a default org + admin membership (free tier: one org).
// Uses a transaction-scoped advisory lock to avoid duplicate orgs under concurrency.
// ---------------------------------------------------------------------------

function advisoryKeys(userId: string): [number, number] {
  const buf = createHash("sha256").update(`coalesce:bootstrap:${userId}`).digest();
  const k1 = buf.readUInt32BE(0) & 0x7fffffff;
  const k2 = buf.readUInt32BE(4) & 0x7fffffff;
  return [k1 || 1, k2 || 1];
}

export async function bootstrapDefaultOrgIfNeeded(
  userId: string,
  orgName?: string,
): Promise<{ created: boolean; orgs: OrgWithRole[] }> {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const [k1, k2] = advisoryKeys(userId);
    await client.query(`SELECT pg_advisory_xact_lock($1::integer, $2::integer)`, [k1, k2]);

    const cntRes = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM organization_members m
       INNER JOIN organizations o ON o.id = m.org_id
       WHERE m.user_id = $1 AND m.status = 'active' AND o.deleted_at IS NULL`,
      [userId],
    );
    const n = parseInt(cntRes.rows[0]?.count ?? "0", 10);
    if (n >= 1) {
      await client.query("COMMIT");
      const orgs = await listUserOrgs(userId);
      return { created: false, orgs };
    }

    let org: Organization | null = null;
    for (let attempt = 0; attempt < 16; attempt++) {
      const slug = `org-${randomBytes(6).toString("hex")}`;
      try {
        const ins = await client.query<Organization>(
          `INSERT INTO organizations (slug, name) VALUES ($1, $2)
           RETURNING id, slug, name, settings, signing_secret, created_at, updated_at`,
          [slug, orgName || "My Organization"],
        );
        org = ins.rows[0] ?? null;
        if (org) break;
      } catch (err: unknown) {
        const code =
          err && typeof err === "object" && "code" in err
            ? (err as { code: string }).code
            : "";
        if (code === "23505") continue;
        throw err;
      }
    }

    if (!org) {
      await client.query("ROLLBACK");
      throw new Error("Failed to create organization after retries");
    }

    await client.query(
      `INSERT INTO organization_members (org_id, user_id, email, role, status, invited_by)
       VALUES ($1, $2, NULL, 'admin', 'active', NULL)`,
      [org.id, userId],
    );

    await client.query("COMMIT");
    const orgs = await listUserOrgs(userId);
    return { created: true, orgs };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
