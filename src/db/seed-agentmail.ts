import "dotenv/config";
import { createClerkClient } from "@clerk/backend";
import { pool, query } from "./pool.js";
import { loadDocs } from "../services/docs-loader.js";
import { createOrg, getOrgBySlug } from "../repositories/organizations.js";
import { createApiKey } from "../repositories/api-keys.js";
import { addMember } from "../repositories/organization-members.js";
import { resolve } from "node:path";

const SEED_CLERK_USER_ID = process.env["SEED_CLERK_USER_ID"]?.trim();
const SEED_USER_EMAIL = process.env["SEED_USER_EMAIL"]?.trim() ?? null;
const SEED_USER_PASSWORD = process.env["SEED_USER_PASSWORD"]?.trim() ?? null;

/** Resolve Clerk `user_...` from env or by looking up / creating the seed user. */
async function resolveSeedClerkUserId(): Promise<string | null> {
  if (SEED_CLERK_USER_ID) return SEED_CLERK_USER_ID;
  if (!SEED_USER_EMAIL) return null;
  const secret = process.env["CLERK_SECRET_KEY"];
  if (!secret) {
    console.warn(
      "SEED_USER_EMAIL is set but CLERK_SECRET_KEY is missing — cannot resolve Clerk user by email.",
    );
    return null;
  }
  const clerk = createClerkClient({ secretKey: secret });

  // Try to find existing user by email
  const list = await clerk.users.getUserList({ emailAddress: [SEED_USER_EMAIL] });
  const existing = list.data[0];
  if (existing) {
    console.log(`Using existing Clerk user: ${existing.id} (${SEED_USER_EMAIL})`);
    return existing.id;
  }

  // Create new user if password is provided
  if (!SEED_USER_PASSWORD) {
    console.warn(
      `No Clerk user found with email ${SEED_USER_EMAIL}. Set SEED_USER_PASSWORD to create one automatically, or sign up in the admin app first.`,
    );
    return null;
  }

  try {
    const created = await clerk.users.createUser({
      emailAddress: [SEED_USER_EMAIL],
      password: SEED_USER_PASSWORD,
    });
    console.log(`Clerk user created: ${created.id} (${SEED_USER_EMAIL})`);
    return created.id;
  } catch (err: unknown) {
    console.error("Failed to create Clerk user:", err instanceof Error ? err.message : err);
    return null;
  }
}

const DOCS_DIR =
  process.env["DOCS_DIR"] ??
  resolve(import.meta.dirname, "../../seed-data/agentmail-docs");

const OPENAPI_PATH =
  process.env["OPENAPI_PATH"] ??
  resolve(import.meta.dirname, "../../seed-data/agentmail-docs/openapi.json");

async function main(): Promise<void> {
  console.log("Loading docs from disk...");
  const docsContent = await loadDocs(DOCS_DIR, OPENAPI_PATH);
  console.log(`Loaded ${docsContent.length} chars of documentation.`);

  console.log("Ensuring organization: agentmail...");
  const existing = await getOrgBySlug("agentmail");
  const org = existing ?? (await createOrg("agentmail", "AgentMail"));
  if (existing) {
    console.log(
      `Organization already exists: id=${org.id}, slug=${org.slug} (replacing docs)`,
    );
    await query(`DELETE FROM doc_content WHERE org_id = $1`, [org.id]);
    await query(`DELETE FROM doc_sources WHERE org_id = $1`, [org.id]);
  } else {
    console.log(`Organization created: id=${org.id}, slug=${org.slug}`);
  }

  const seedUserId = await resolveSeedClerkUserId();
  if (seedUserId) {
    await addMember(org.id, seedUserId, SEED_USER_EMAIL, "admin");
    console.log(`Linked Clerk user ${seedUserId} as admin on organization_members.`);
  } else {
    console.error(
      "\n╔══════════════════════════════════════════════════════════════════════╗",
    );
    console.error(
      "║ SEED: No row in organization_members — admin UI will show no orgs     ║",
    );
    console.error(
      "║ Seed does NOT write to Clerk; it only links your Clerk user in DB.  ║",
    );
    console.error(
      "╠══════════════════════════════════════════════════════════════════════╣",
    );
    console.error(
      "║ 1) Clerk Dashboard → Users → your user → copy User ID (user_...)    ║",
    );
    console.error(
      "║ 2) In .env: SEED_CLERK_USER_ID=<that id>  (same Clerk app as admin)  ║",
    );
    console.error(
      "║    Or: SEED_USER_EMAIL=you@... plus CLERK_SECRET_KEY for lookup     ║",
    );
    console.error(
      "║ 3) DATABASE_URL must be THIS database (Neon branch you are viewing). ║",
    );
    console.error(
      "║ 4) Or skip seed: sign into admin once — bootstrap creates an org.   ║",
    );
    console.error(
      "╚══════════════════════════════════════════════════════════════════════╝\n",
    );
  }

  console.log("Inserting doc_source...");
  const sourceResult = await query<{ id: string }>(
    `INSERT INTO doc_sources (org_id, source_type, source_path, loaded_at)
     VALUES ($1, 'raw', $2, now())
     RETURNING id`,
    [org.id, DOCS_DIR],
  );
  const sourceId = sourceResult.rows[0]?.id;
  if (!sourceId) {
    throw new Error("Failed to insert doc_source");
  }
  console.log(`doc_source created: id=${sourceId}`);

  console.log("Inserting doc_content...");
  await query(
    `INSERT INTO doc_content (org_id, source_id, title, content, metadata)
     VALUES ($1, $2, $3, $4, '{}')`,
    [org.id, sourceId, "AgentMail Documentation", docsContent],
  );
  console.log("doc_content inserted.");

  const keys = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM api_keys
     WHERE org_id = $1 AND revoked_at IS NULL`,
    [org.id],
  );
  const keyCount = Number(keys.rows[0]?.n ?? 0);
  if (keyCount === 0) {
    console.log("Creating API key...");
    const apiKey = await createApiKey(org.id, "default");
    console.log(`\nAgentMail API key: ${apiKey.rawKey}\n`);
  } else {
    console.log(
      `\nSkipped new API key (${keyCount} active key(s) already). Revoke in DB if you need a fresh one.\n`,
    );
  }

  await pool.end();
  console.log("Done. Pool closed.");
}

main().catch((err: unknown) => {
  console.error("Seed failed:", err);
  pool.end().finally(() => process.exit(1));
});
