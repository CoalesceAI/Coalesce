import 'dotenv/config';
import fs from 'node:fs';
import { query, pool } from './pool.js';

async function main() {
  const org = await query<{ id: string }>('SELECT id FROM organizations WHERE slug = $1', ['agentmail']);
  if (!org.rows[0]) {
    console.error('AgentMail org not found. Run npm run seed first.');
    process.exit(1);
  }
  const orgId = org.rows[0].id;
  console.log('Org ID:', orgId);

  // Delete any existing support knowledge (raw or anonymized)
  const deleted = await query(
    "DELETE FROM doc_content WHERE org_id = $1 AND title LIKE '%Support%'",
    [orgId]
  );
  console.log('Deleted old support content:', deleted.rowCount, 'rows');

  // Find or create source
  let sourceId: string;
  const existing = await query<{ id: string }>(
    "SELECT id FROM doc_sources WHERE org_id = $1 AND source_path = 'support-patterns'",
    [orgId]
  );
  if (existing.rows[0]) {
    sourceId = existing.rows[0].id;
  } else {
    const source = await query<{ id: string }>(
      "INSERT INTO doc_sources (org_id, source_type, source_path) VALUES ($1, 'raw', 'support-patterns') RETURNING id",
      [orgId]
    );
    sourceId = source.rows[0].id;
  }
  console.log('Source ID:', sourceId);

  // Load anonymized patterns (NO raw customer data)
  const content = fs.readFileSync('/Users/tkam/Desktop/Coalesce/support-patterns.md', 'utf-8');

  await query(
    'INSERT INTO doc_content (org_id, source_id, title, content) VALUES ($1, $2, $3, $4)',
    [orgId, sourceId, 'AgentMail Support Resolution Patterns (anonymized)', content]
  );

  console.log('Inserted anonymized support patterns:', content.length, 'chars');
  console.log('Done. No PII in database.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
