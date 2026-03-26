/**
 * Seed AgentMail docs by crawling docs.agentmail.to
 * No local filesystem dependency — works on any machine.
 *
 * Usage: npx tsx src/db/seed-from-web.ts
 */

import 'dotenv/config';
import { query, pool } from './pool.js';
import { createOrg } from '../repositories/organizations.js';
import { createApiKey } from '../repositories/api-keys.js';
import { getOrgBySlug } from '../repositories/organizations.js';

const SITEMAP_URL = 'https://docs.agentmail.to/sitemap.xml';
const OPENAPI_URL = 'https://docs.agentmail.to/openapi.json';
const CONCURRENCY = 5;
const DELAY_MS = 200; // be polite

// Skip changelog, they're not useful for diagnosis
const SKIP_PATTERNS = ['/changelog'];

async function fetchSitemap(): Promise<string[]> {
  console.log('Fetching sitemap...');
  const res = await fetch(SITEMAP_URL);
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]).filter((u): u is string => !!u);
  const filtered = urls.filter(url => !SKIP_PATTERNS.some(p => url.includes(p)));
  console.log(`  Found ${urls.length} URLs, ${filtered.length} after filtering`);
  return filtered;
}

async function fetchPage(url: string): Promise<{ title: string; content: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const html = await res.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch?.[1]?.replace(/ \| AgentMail.*$/, '').trim() ?? url;

    // Strip HTML to text
    let text = html
      // Remove script and style tags
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      // Remove nav, header, footer, sidebar
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      // Convert common elements to text
      .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n## $1\n')
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
      // Remove remaining HTML tags
      .replace(/<[^>]+>/g, '')
      // Decode HTML entities
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      // Clean up whitespace
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (text.length < 50) return null; // skip empty pages

    return { title, content: text };
  } catch {
    return null;
  }
}

async function fetchOpenAPI(): Promise<string | null> {
  try {
    console.log('Fetching OpenAPI spec...');
    const res = await fetch(OPENAPI_URL);
    if (!res.ok) {
      // Try YAML
      const yamlRes = await fetch('https://docs.agentmail.to/openapi.yaml');
      if (!yamlRes.ok) return null;
      return await yamlRes.text();
    }
    return await res.text();
  } catch {
    return null;
  }
}

async function main() {
  console.log('🌐 Seeding AgentMail docs from docs.agentmail.to\n');

  // Get or create org
  let org = await getOrgBySlug('agentmail');
  if (!org) {
    console.log('Creating agentmail organization...');
    org = await createOrg('agentmail', 'AgentMail');
    const key = await createApiKey(org.id, 'default');
    console.log(`API key: ${key.rawKey}`);
  } else {
    console.log(`Using existing org: ${org.id}`);
  }

  // Clear existing docs
  const deleted = await query(
    "DELETE FROM doc_content WHERE org_id = $1 AND title NOT LIKE '%Support%'",
    [org.id]
  );
  console.log(`Cleared ${deleted.rowCount} existing doc rows\n`);

  // Create doc source
  const source = await query<{ id: string }>(
    "INSERT INTO doc_sources (org_id, source_type, source_path) VALUES ($1, 'url', 'https://docs.agentmail.to') RETURNING id",
    [org.id]
  );
  const sourceId = source.rows[0]!.id;

  // Fetch sitemap
  const urls = await fetchSitemap();

  // Crawl pages with concurrency limit
  let crawled = 0;
  let inserted = 0;
  let totalChars = 0;

  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(url => fetchPage(url)));

    for (let j = 0; j < results.length; j++) {
      crawled++;
      const page = results[j];
      if (!page) continue;

      await query(
        'INSERT INTO doc_content (org_id, source_id, title, content) VALUES ($1, $2, $3, $4)',
        [org.id, sourceId, page.title, page.content]
      );
      inserted++;
      totalChars += page.content.length;
    }

    if (i + CONCURRENCY < urls.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    process.stdout.write(`\r  Crawled ${crawled}/${urls.length} pages, ${inserted} inserted`);
  }

  console.log(`\n\n  Pages crawled: ${crawled}`);
  console.log(`  Pages inserted: ${inserted}`);
  console.log(`  Total chars: ${totalChars} (~${Math.round(totalChars / 4)} tokens)`);

  // Fetch OpenAPI
  const openapi = await fetchOpenAPI();
  if (openapi) {
    await query(
      'INSERT INTO doc_content (org_id, source_id, title, content) VALUES ($1, $2, $3, $4)',
      [org.id, sourceId, 'AgentMail OpenAPI Specification', openapi]
    );
    console.log(`  OpenAPI spec: ${openapi.length} chars`);
  }

  console.log('\n✅ Done. Coalesce will use web-crawled docs for diagnosis.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
