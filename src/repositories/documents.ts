import { query } from "../db/pool.js";

// ---------------------------------------------------------------------------
// Load org-specific documentation from DB
// ---------------------------------------------------------------------------

export async function loadOrgDocs(orgId: string): Promise<string> {
  const result = await query<{ content: string; title: string }>(
    `SELECT dc.content, dc.title FROM doc_content dc WHERE dc.org_id = $1 ORDER BY dc.created_at`,
    [orgId],
  );
  return result.rows
    .map((row) => `# ${row.title}\n\n${row.content}`)
    .join('\n\n---\n\n');
}
