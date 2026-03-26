import 'dotenv/config';
import { query, pool } from '../src/db/pool.js';

async function main() {
  const sessions = await query<{ total: string; resolved: string; active: string }>(
    `SELECT
       COUNT(*) as total,
       COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved,
       COUNT(CASE WHEN status = 'active' THEN 1 END) as active
     FROM sessions`
  );
  console.log('Sessions:', sessions.rows[0]);

  const recent = await query<{ session_id: string; status: string; turn_count: number; created: string }>(
    `SELECT id as session_id, status,
       jsonb_array_length(turns) as turn_count,
       to_char(created_at, 'HH24:MI:SS') as created
     FROM sessions ORDER BY created_at DESC LIMIT 10`
  );
  console.log('\nRecent 10 sessions:');
  for (const r of recent.rows) {
    console.log(`  ${r.created} | ${r.status.padEnd(10)} | ${r.turn_count} turns`);
  }

  const docs = await query<{ title: string; chars: number }>(
    `SELECT title, length(content) as chars FROM doc_content`
  );
  console.log('\nDoc content loaded:');
  for (const d of docs.rows) {
    console.log(`  ${d.title}: ${d.chars} chars`);
  }

  await pool.end();
}

main().catch(console.error);
