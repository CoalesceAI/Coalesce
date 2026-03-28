import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import { pool } from "../db/pool.js";

// ---------------------------------------------------------------------------
// Notion integration service
// ---------------------------------------------------------------------------

function getClient(accessToken: string): Client {
  return new Client({ auth: accessToken });
}

export interface NotionPage {
  id: string;
  title: string;
  url: string;
  lastEdited: string;
}

export async function listNotionPages(accessToken: string): Promise<NotionPage[]> {
  const notion = getClient(accessToken);
  const response = await notion.search({
    filter: { property: "object", value: "page" },
    sort: { direction: "descending", timestamp: "last_edited_time" },
    page_size: 50,
  });

  return response.results
    .filter((r): r is Extract<typeof r, { object: "page" }> => r.object === "page")
    .map((page) => {
      let title = "Untitled";
      if ("properties" in page) {
        const titleProp = Object.values(page.properties).find(
          (p) => p.type === "title",
        );
        if (titleProp && titleProp.type === "title" && titleProp.title.length > 0) {
          title = titleProp.title.map((t) => t.plain_text).join("");
        }
      }
      return {
        id: page.id,
        title,
        url: "url" in page ? (page.url as string) : "",
        lastEdited: "last_edited_time" in page ? (page.last_edited_time as string) : "",
      };
    });
}

export async function importNotionPage(
  accessToken: string,
  pageId: string,
  orgId: string,
  integrationId: string,
): Promise<{ sourceId: string; title: string }> {
  const notion = getClient(accessToken);
  const n2m = new NotionToMarkdown({ notionClient: notion });

  const mdBlocks = await n2m.pageToMarkdown(pageId);
  const markdown = n2m.toMarkdownString(mdBlocks);
  const content = typeof markdown === "string" ? markdown : markdown.parent;

  const page = await notion.pages.retrieve({ page_id: pageId });
  let title = "Untitled";
  if ("properties" in page) {
    const titleProp = Object.values(page.properties).find(
      (p) => p.type === "title",
    );
    if (titleProp && titleProp.type === "title" && titleProp.title.length > 0) {
      title = titleProp.title.map((t) => t.plain_text).join("");
    }
  }
  const pageUrl = "url" in page ? (page.url as string) : "";

  const insertResult = await pool.query<{ id: string }>(
    `INSERT INTO doc_sources (org_id, source_type, source_path, title, status, integration_id, config)
     VALUES ($1, 'notion', $2, $3, 'ready', $4, $5)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [orgId, pageUrl, title, integrationId, JSON.stringify({ notion_page_id: pageId })],
  );

  const sourceId = insertResult.rows[0]?.id;
  if (!sourceId) {
    throw new Error("Page already imported or insert failed");
  }

  await pool.query(
    `INSERT INTO doc_content (org_id, source_id, title, content, metadata)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (source_id) WHERE (metadata->>'page_url') IS NULL
     DO UPDATE SET content = EXCLUDED.content, title = EXCLUDED.title, updated_at = now()`,
    [orgId, sourceId, title, content, JSON.stringify({ page_url: pageUrl, notion_page_id: pageId })],
  );

  await pool.query(
    `UPDATE doc_sources SET status = 'ready', last_sync_at = now() WHERE id = $1`,
    [sourceId],
  );

  return { sourceId, title };
}

export async function syncNotionPage(
  accessToken: string,
  sourceId: string,
  orgId: string,
): Promise<void> {
  const configResult = await pool.query<{ config: { notion_page_id?: string } }>(
    `SELECT config FROM doc_sources WHERE id = $1 AND org_id = $2`,
    [sourceId, orgId],
  );

  const pageId = configResult.rows[0]?.config?.notion_page_id;
  if (!pageId) throw new Error("No Notion page ID found for this source");

  const notion = getClient(accessToken);
  const n2m = new NotionToMarkdown({ notionClient: notion });

  const mdBlocks = await n2m.pageToMarkdown(pageId);
  const markdown = n2m.toMarkdownString(mdBlocks);
  const content = typeof markdown === "string" ? markdown : markdown.parent;

  await pool.query(
    `UPDATE doc_content SET content = $1, updated_at = now()
     WHERE source_id = $2 AND org_id = $3`,
    [content, sourceId, orgId],
  );

  await pool.query(
    `UPDATE doc_sources SET status = 'ready', last_sync_at = now() WHERE id = $1`,
    [sourceId],
  );
}
