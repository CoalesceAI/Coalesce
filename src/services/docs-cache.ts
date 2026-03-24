import { query } from "../db/pool.js";

// ---------------------------------------------------------------------------
// DocsCache interface
// ---------------------------------------------------------------------------

export interface DocsCache {
  /** Returns concatenated documentation content for a tenant. */
  get(tenantId: string): Promise<string>;
  /** Removes cached entry, forcing a fresh DB load on next get(). */
  invalidate(tenantId: string): void;
}

// ---------------------------------------------------------------------------
// Cache entry shape
// ---------------------------------------------------------------------------

interface CacheEntry {
  content: string;
  loadedAt: number;
}

// ---------------------------------------------------------------------------
// Row shape from the docs query
// ---------------------------------------------------------------------------

interface DocRow {
  tenant_name: string;
  title: string | null;
  content: string;
}

// ---------------------------------------------------------------------------
// TenantDocsCache — in-memory Map with configurable TTL
// ---------------------------------------------------------------------------

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class TenantDocsCache implements DocsCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(ttlMs?: number) {
    this.ttlMs =
      ttlMs ?? Number(process.env["DOCS_CACHE_TTL_MS"] ?? DEFAULT_TTL_MS);
  }

  async get(tenantId: string): Promise<string> {
    const entry = this.cache.get(tenantId);
    const now = Date.now();

    if (entry && now - entry.loadedAt < this.ttlMs) {
      return entry.content;
    }

    // Cache miss or stale — query from Postgres
    const result = await query<DocRow>(
      `SELECT t.name AS tenant_name, dc.title, dc.content
         FROM doc_content dc
         JOIN tenants t ON t.id = dc.tenant_id
        WHERE dc.tenant_id = $1
        ORDER BY dc.title NULLS LAST, dc.created_at`,
      [tenantId],
    );

    let content: string;

    if (result.rows.length === 0) {
      content = "";
    } else {
      // Use the tenant name from the first row (all rows share the same tenant)
      const tenantName = result.rows[0]!.tenant_name;
      const sections = result.rows.map((row) => {
        const header = row.title ? `## Source: ${row.title}` : "## Source";
        return `${header}\n\n${row.content}`;
      });

      content = `# ${tenantName} Documentation\n\n${sections.join("\n\n")}`;
    }

    this.cache.set(tenantId, { content, loadedAt: now });
    return content;
  }

  invalidate(tenantId: string): void {
    this.cache.delete(tenantId);
  }
}
