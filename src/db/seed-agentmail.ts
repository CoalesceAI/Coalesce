import "dotenv/config";
import { pool, query } from "./pool.js";
import { loadDocs } from "../services/docs-loader.js";
import { createOrg, getOrgBySlug } from "../repositories/organizations.js";
import { createApiKey } from "../repositories/api-keys.js";
import { resolve } from "node:path";

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
