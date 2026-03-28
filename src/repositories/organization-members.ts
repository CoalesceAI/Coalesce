import { query } from "../db/pool.js";
import type { Organization } from "../domain/organization.js";

// ---------------------------------------------------------------------------
// Organization membership CRUD
// ---------------------------------------------------------------------------

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  email: string | null;
  role: "admin" | "member";
  status: "active" | "pending";
  invited_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface OrgWithRole extends Organization {
  role: "admin" | "member";
}

export async function listUserOrgs(userId: string): Promise<OrgWithRole[]> {
  const result = await query<OrgWithRole>(
    `SELECT o.id, o.slug, o.name, o.settings, o.signing_secret, o.created_at, o.updated_at,
            m.role
       FROM organization_members m
       JOIN organizations o ON o.id = m.org_id
      WHERE m.user_id = $1
        AND m.status = 'active'
        AND o.deleted_at IS NULL
      ORDER BY o.created_at DESC`,
    [userId],
  );
  return result.rows;
}

export async function listOrgMembers(orgId: string): Promise<OrgMember[]> {
  const result = await query<OrgMember>(
    `SELECT id, org_id, user_id, email, role, status, invited_by, created_at, updated_at
       FROM organization_members
      WHERE org_id = $1
      ORDER BY created_at ASC`,
    [orgId],
  );
  return result.rows;
}

export async function addMember(
  orgId: string,
  userId: string,
  email: string | null,
  role: "admin" | "member",
  invitedBy?: string,
  status: "active" | "pending" = "active",
): Promise<OrgMember> {
  const result = await query<OrgMember>(
    `INSERT INTO organization_members (org_id, user_id, email, role, status, invited_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (org_id, user_id) DO UPDATE SET
       role = EXCLUDED.role,
       email = COALESCE(EXCLUDED.email, organization_members.email),
       status = EXCLUDED.status,
       updated_at = now()
     RETURNING id, org_id, user_id, email, role, status, invited_by, created_at, updated_at`,
    [orgId, userId, email, role, status, invitedBy ?? null],
  );
  const member = result.rows[0];
  if (!member) throw new Error("Failed to add member");
  return member;
}

export async function removeMember(orgId: string, userId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM organization_members WHERE org_id = $1 AND user_id = $2`,
    [orgId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function updateMemberRole(
  orgId: string,
  userId: string,
  role: "admin" | "member",
): Promise<OrgMember | null> {
  const result = await query<OrgMember>(
    `UPDATE organization_members SET role = $3, updated_at = now()
     WHERE org_id = $1 AND user_id = $2
     RETURNING id, org_id, user_id, email, role, status, invited_by, created_at, updated_at`,
    [orgId, userId, role],
  );
  return result.rows[0] ?? null;
}

export async function getUserOrgRole(
  orgId: string,
  userId: string,
): Promise<"admin" | "member" | null> {
  const result = await query<{ role: "admin" | "member" }>(
    `SELECT role FROM organization_members
     WHERE org_id = $1 AND user_id = $2 AND status = 'active'`,
    [orgId, userId],
  );
  return result.rows[0]?.role ?? null;
}

export async function countUserOrgs(userId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM organization_members m
       JOIN organizations o ON o.id = m.org_id
      WHERE m.user_id = $1
        AND m.status = 'active'
        AND o.deleted_at IS NULL`,
    [userId],
  );
  return parseInt(result.rows[0]?.count ?? "0", 10);
}

export async function countOrgAdmins(orgId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM organization_members
     WHERE org_id = $1 AND role = 'admin' AND status = 'active'`,
    [orgId],
  );
  return parseInt(result.rows[0]?.count ?? "0", 10);
}

export async function findMemberByEmail(
  orgId: string,
  email: string,
): Promise<OrgMember | null> {
  const result = await query<OrgMember>(
    `SELECT id, org_id, user_id, email, role, status, invited_by, created_at, updated_at
       FROM organization_members
      WHERE org_id = $1 AND LOWER(email) = LOWER($2)`,
    [orgId, email],
  );
  return result.rows[0] ?? null;
}
