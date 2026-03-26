import 'dotenv/config';
import { query, pool } from '../src/db/pool.js';

async function main() {
  const dist = await query<{ endpoint: string; error_code: string; context: string; count: string }>(
    `SELECT
       original_request->>'endpoint' as endpoint,
       original_request->>'error_code' as error_code,
       original_request->>'context' as context,
       COUNT(*) as count
     FROM sessions
     GROUP BY 1, 2, 3
     ORDER BY count DESC
     LIMIT 15`
  );

  console.log('Error distribution across sessions:\n');
  for (const row of dist.rows) {
    console.log(`  ${row.count.padStart(3)}x | ${(row.error_code ?? '?').padEnd(4)} | ${(row.context ?? '?').padEnd(25)} | ${row.endpoint ?? '?'}`);
  }

  const total = await query<{ count: string }>('SELECT COUNT(*) as count FROM sessions');
  console.log(`\nTotal sessions: ${total.rows[0].count}`);

  await pool.end();
}

main().catch(console.error);
