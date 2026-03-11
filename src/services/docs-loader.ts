import { readdir, readFile } from 'fs/promises';
import { join, relative } from 'path';

/**
 * Strip non-informative MDX content from a file's text.
 *
 * Pipeline (order matters):
 * 1. Remove YAML frontmatter (--- block at top)
 * 2. Remove import lines
 * 3. Remove paired JSX tags with content (multiline, non-greedy)
 * 4. Remove self-closing JSX tags
 * 5. Remove {" "} whitespace hints
 * 6. Collapse 3+ newlines to double newline
 * 7. Trim
 */
export function stripMdx(content: string): string {
  let result = content;

  // 1. Remove YAML frontmatter: --- ... --- at top of file
  result = result.replace(/^---[\s\S]*?---\n?/, '');

  // 2. Remove import lines
  result = result.replace(/^import\s+.*$/gm, '');

  // 3. Remove paired JSX tags with content (multiline, non-greedy)
  //    Matches <ComponentName ...>...</ComponentName>
  //    The [\s\S]*? handles multiline content; non-greedy to avoid over-matching
  result = result.replace(/<[A-Z][A-Za-z]*[^>]*>[\s\S]*?<\/[A-Z][A-Za-z]*>/g, '');

  // 4. Remove self-closing JSX tags like <Card href="..." /> or <Note />
  result = result.replace(/<[A-Z][A-Za-z]*[^>]*\/>/g, '');

  // 5. Remove {" "} whitespace hints
  result = result.replace(/\{"\s*"\}/g, '');

  // 6. Collapse 3+ consecutive newlines to double newline
  result = result.replace(/\n{3,}/g, '\n\n');

  // 7. Trim
  return result.trim();
}

/**
 * Recursively collect all .mdx files in a directory tree.
 * Returns an array of absolute file paths.
 */
export async function collectMdxFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await collectMdxFiles(fullPath);
      files.push(...subFiles);
    } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Load all AgentMail MDX documentation files and the OpenAPI spec.
 * Returns a single concatenated string suitable for Claude's system prompt.
 *
 * Output structure:
 * # AgentMail Documentation
 *
 * ## File: {relative_path}
 *
 * {stripped_content}
 *
 * ...
 *
 * # AgentMail OpenAPI Specification
 *
 * {openapi_json}
 */
export async function loadDocs(docsDir: string, openapiPath: string): Promise<string> {
  // Collect all MDX files
  const mdxFiles = await collectMdxFiles(docsDir);

  // Sort for deterministic ordering
  mdxFiles.sort();

  // Build documentation sections
  const sections: string[] = ['# AgentMail Documentation\n'];

  for (const filePath of mdxFiles) {
    const content = await readFile(filePath, 'utf-8');
    const stripped = stripMdx(content);
    const relativePath = relative(docsDir, filePath);
    sections.push(`## File: ${relativePath}\n\n${stripped}`);
  }

  // Load and append OpenAPI spec
  const openapiContent = await readFile(openapiPath, 'utf-8');
  sections.push(`# AgentMail OpenAPI Specification\n\n${openapiContent}`);

  return sections.join('\n\n');
}
