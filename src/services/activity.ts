import { pool } from "../db/pool.js";

// ---------------------------------------------------------------------------
// Activity logging — fire-and-forget event recorder for admin actions
// ---------------------------------------------------------------------------

export interface ActivityEvent {
  orgId?: string;
  actor?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

export async function logActivity(event: ActivityEvent): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO activity_log (org_id, actor, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        event.orgId ?? null,
        event.actor ?? "system",
        event.action,
        event.resourceType ?? null,
        event.resourceId ?? null,
        JSON.stringify(event.metadata ?? {}),
      ],
    );
  } catch (err) {
    console.error("Failed to log activity:", err);
  }
}

export async function getRecentActivity(
  limit = 50,
  orgId?: string,
): Promise<Array<{
  id: string;
  org_id: string | null;
  actor: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}>> {
  const params: unknown[] = [limit];
  let whereClause = "";
  if (orgId) {
    whereClause = "WHERE org_id = $2";
    params.push(orgId);
  }

  const result = await pool.query<{
    id: string;
    org_id: string | null;
    actor: string;
    action: string;
    resource_type: string | null;
    resource_id: string | null;
    metadata: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT id, org_id, actor, action, resource_type, resource_id, metadata, created_at
     FROM activity_log
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $1`,
    params,
  );

  return result.rows;
}
