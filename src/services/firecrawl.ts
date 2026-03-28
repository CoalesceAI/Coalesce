import Firecrawl from "@mendable/firecrawl-js";
import { pool } from "../db/pool.js";

// ---------------------------------------------------------------------------
// Firecrawl service — single-page scrape + store into doc_content
// ---------------------------------------------------------------------------

function getClient(): Firecrawl {
  const apiKey = process.env["FIRECRAWL_API_KEY"];
  if (!apiKey) {
    throw new Error("FIRECRAWL_API_KEY is not set");
  }
  return new Firecrawl({ apiKey });
}

// Scrape a single URL and upsert the markdown content into doc_content.
// Updates doc_sources.status throughout:
//   pending → crawling → ready (or error)
export async function scrapeAndStore(
  orgId: string,
  sourceId: string,
  url: string,
): Promise<void> {
  await pool.query(
    `UPDATE doc_sources SET status = 'crawling' WHERE id = $1`,
    [sourceId],
  );

  try {
    const firecrawl = getClient();
    const result = await firecrawl.scrape(url, { formats: ["markdown"] });

    const markdown = result.markdown ?? "";
    const title = result.metadata?.title ?? url;

    await pool.query(
      `INSERT INTO doc_content (org_id, source_id, title, content, metadata)
       VALUES ($1, $2, $3, $4, '{}')
       ON CONFLICT (source_id) WHERE (metadata->>'page_url') IS NULL
       DO UPDATE SET content = EXCLUDED.content, title = EXCLUDED.title, updated_at = now()`,
      [orgId, sourceId, title, markdown],
    );

    await pool.query(
      `UPDATE doc_sources SET status = 'ready', last_sync_at = now() WHERE id = $1`,
      [sourceId],
    );
  } catch (err) {
    await pool.query(
      `UPDATE doc_sources SET status = 'error', error_message = $2 WHERE id = $1`,
      [sourceId, String(err)],
    );
    throw err;
  }
}
