import "dotenv/config";
import { pool, query } from "./pool.js";
import { loadDocs } from "../services/docs-loader.js";
import { createOrg } from "../repositories/organizations.js";
import { createApiKey } from "../repositories/api-keys.js";
import { resolve } from "node:path";

const DOCS_DIR =
  process.env["DOCS_DIR"] ??
  resolve(import.meta.dirname, "../../../agentmail/agentmail-docs/fern/pages");

const OPENAPI_PATH =
  process.env["OPENAPI_PATH"] ??
  resolve(
    import.meta.dirname,
    "../../../agentmail/agentmail-docs/current-openapi.json",
  );

async function main(): Promise<void> {
  console.log("Loading docs from disk...");
  const docsContent = await loadDocs(DOCS_DIR, OPENAPI_PATH);
  console.log(`Loaded ${docsContent.length} chars of documentation.`);

  console.log("Creating organization: agentmail...");
  const org = await createOrg("agentmail", "AgentMail");
  console.log(`Organization created: id=${org.id}, slug=${org.slug}`);

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

  console.log("Creating API key...");
  const apiKey = await createApiKey(org.id, "default");
  console.log(`\nAgentMail API key: ${apiKey.rawKey}\n`);

  await pool.end();
  console.log("Done. Pool closed.");
}

main().catch((err: unknown) => {
  console.error("Seed failed:", err);
  pool.end().finally(() => process.exit(1));
});
