import 'dotenv/config';
import { query, pool } from './pool.js';
import { generateSignedBaseUrl } from '../domain/signed-url.js';

async function main() {
  const slug = process.argv[2] ?? 'agentmail';
  const apoyoUrl = process.argv[3] ?? 'https://apoyo-production.up.railway.app';

  const result = await query<{ slug: string; signing_secret: string }>(
    'SELECT slug, signing_secret FROM organizations WHERE slug = $1',
    [slug],
  );

  const org = result.rows[0];
  if (!org) {
    console.error(`Organization '${slug}' not found`);
    process.exit(1);
  }

  const signedUrl = generateSignedBaseUrl(apoyoUrl, org.slug, org.signing_secret);

  console.log(`Organization: ${slug}`);
  console.log(`Signed support base URL:\n`);
  console.log(signedUrl);
  console.log(`\nSet this as APOYO_SUPPORT_URL in AgentMail's env.`);
  console.log(`Their error middleware appends &endpoint=...&error_code=... to it.`);
  console.log(`Agents call the full URL — no auth header needed.`);

  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
