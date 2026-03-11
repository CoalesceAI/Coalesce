import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { stripMdx, loadDocs, collectMdxFiles } from '../src/services/docs-loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================
// Task 1: stripMdx tests
// ============================================================

describe('stripMdx', () => {
  it('removes YAML frontmatter block', () => {
    const input = `---
title: "Test Page"
slug: test
description: "A test page."
---

## Introduction

This is the content.`;

    const result = stripMdx(input);
    expect(result).not.toContain('---');
    expect(result).not.toContain('title:');
    expect(result).toContain('## Introduction');
    expect(result).toContain('This is the content.');
  });

  it('removes import statements', () => {
    const input = `import Tabs from '@components/tabs'
import { CodeBlock } from 'some-lib'

## Content

Some text here.`;

    const result = stripMdx(input);
    expect(result).not.toContain("import Tabs");
    expect(result).not.toContain("import { CodeBlock }");
    expect(result).toContain('## Content');
    expect(result).toContain('Some text here.');
  });

  it('removes self-closing JSX tags', () => {
    const input = `## Section

<Note title="Important" />

<Warning icon="alert" />

Some text here.`;

    const result = stripMdx(input);
    expect(result).not.toContain('<Note');
    expect(result).not.toContain('<Warning');
    expect(result).toContain('## Section');
    expect(result).toContain('Some text here.');
  });

  it('removes paired multiline JSX tags and their content', () => {
    const input = `## Cards Section

<Cards>

{" "}

<Card title="Python SDK" href="https://example.com">
  Use our Python SDK.
</Card>

</Cards>

## After Cards

Text after cards.`;

    const result = stripMdx(input);
    expect(result).not.toContain('<Cards>');
    expect(result).not.toContain('<Card');
    expect(result).toContain('## After Cards');
    expect(result).toContain('Text after cards.');
  });

  it('removes AccordionGroup paired JSX tags and content', () => {
    const input = `## FAQ

<AccordionGroup>
  <Accordion title="What is AgentMail?">
    AgentMail is an API-first email platform.
  </Accordion>
  <Accordion title="How is it different?">
    Focus on conversational agents.
  </Accordion>
</AccordionGroup>

## After FAQ

Content after the FAQ.`;

    const result = stripMdx(input);
    expect(result).not.toContain('<AccordionGroup>');
    expect(result).not.toContain('<Accordion');
    expect(result).toContain('## After FAQ');
    expect(result).toContain('Content after the FAQ.');
  });

  it('removes {" "} whitespace hints', () => {
    const input = `## Section

{" "}

Some text.

{" "}`;

    const result = stripMdx(input);
    expect(result).not.toContain('{" "}');
    expect(result).toContain('## Section');
    expect(result).toContain('Some text.');
  });

  it('collapses 3+ blank lines to double newline', () => {
    const input = `## Heading



Some text after multiple blank lines.`;

    const result = stripMdx(input);
    // Should not have 3+ consecutive newlines
    expect(result).not.toMatch(/\n{3,}/);
    expect(result).toContain('## Heading');
    expect(result).toContain('Some text after multiple blank lines.');
  });

  it('preserves markdown headings, paragraphs, code blocks, and lists', () => {
    const input = `## Core Concepts

Here is a list of important concepts:

- **Inboxes** - where emails are received
- **Threads** - groups of related messages

\`\`\`typescript
const inbox = await client.inboxes.create({ username: 'my-agent' });
\`\`\`

A regular paragraph with **bold** and \`inline code\`.`;

    const result = stripMdx(input);
    expect(result).toContain('## Core Concepts');
    expect(result).toContain('- **Inboxes**');
    expect(result).toContain('- **Threads**');
    expect(result).toContain("```typescript");
    expect(result).toContain("const inbox = await client.inboxes.create");
    expect(result).toContain('**bold**');
    expect(result).toContain('`inline code`');
  });

  it('handles the sample.mdx fixture file correctly', () => {
    const fixturePath = join(__dirname, 'fixtures', 'sample.mdx');
    const content = readFileSync(fixturePath, 'utf-8');
    const result = stripMdx(content);

    // Frontmatter removed
    expect(result).not.toMatch(/^---/m);
    expect(result).not.toContain('title: "Sample Documentation Page"');

    // Imports removed
    expect(result).not.toContain("import Tabs");
    expect(result).not.toContain("import { CodeBlock }");

    // JSX components removed
    expect(result).not.toContain('<Cards>');
    expect(result).not.toContain('<Card');
    expect(result).not.toContain('<AccordionGroup>');
    expect(result).not.toContain('<Note');
    expect(result).not.toContain('{" "}');

    // Markdown content preserved
    expect(result).toContain('## Introduction');
    expect(result).toContain('## Core Concepts');
    expect(result).toContain('## Code Example');
    expect(result).toContain('- **Inboxes**');
    expect(result).toContain('```typescript');
    expect(result).toContain('## Summary');
  });
});

// ============================================================
// Task 2: collectMdxFiles and loadDocs tests
// ============================================================

describe('collectMdxFiles', () => {
  it('recursively finds all .mdx files in a directory', async () => {
    const fixturesDir = join(__dirname, 'fixtures');
    const files = await collectMdxFiles(fixturesDir);

    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f: string) => f.endsWith('.mdx'))).toBe(true);
    expect(files.some((f: string) => f.includes('sample.mdx'))).toBe(true);
  });
});

describe('loadDocs', () => {
  it('returns a string with documentation header', async () => {
    const fixturesDir = join(__dirname, 'fixtures');
    const openapiPath = join(__dirname, 'fixtures', 'sample-openapi.json');
    const result = await loadDocs(fixturesDir, openapiPath);

    expect(typeof result).toBe('string');
    expect(result).toContain('# AgentMail Documentation');
  });

  it('returns a string with OpenAPI header', async () => {
    const fixturesDir = join(__dirname, 'fixtures');
    const openapiPath = join(__dirname, 'fixtures', 'sample-openapi.json');
    const result = await loadDocs(fixturesDir, openapiPath);

    expect(result).toContain('# AgentMail OpenAPI Specification');
  });

  it('prefixes each MDX file section with ## File: {relative_path}', async () => {
    const fixturesDir = join(__dirname, 'fixtures');
    const openapiPath = join(__dirname, 'fixtures', 'sample-openapi.json');
    const result = await loadDocs(fixturesDir, openapiPath);

    expect(result).toContain('## File: sample.mdx');
  });

  it('includes the OpenAPI JSON content', async () => {
    const fixturesDir = join(__dirname, 'fixtures');
    const openapiPath = join(__dirname, 'fixtures', 'sample-openapi.json');
    const result = await loadDocs(fixturesDir, openapiPath);

    // The OpenAPI fixture should contain some identifiable content
    expect(result).toContain('openapi');
  });

  it('strips JSX from loaded MDX files', async () => {
    const fixturesDir = join(__dirname, 'fixtures');
    const openapiPath = join(__dirname, 'fixtures', 'sample-openapi.json');
    const result = await loadDocs(fixturesDir, openapiPath);

    expect(result).not.toContain('<Cards>');
    expect(result).not.toContain('<AccordionGroup>');
    expect(result).not.toContain('{" "}');
  });

  // ============================================================
  // Integration test: Real AgentMail docs
  // ============================================================
  it('integration: loads all real AgentMail MDX files and OpenAPI spec', async () => {
    const docsDir = join(__dirname, '../../agentmail/agentmail-docs/fern/pages');
    const openapiPath = join(__dirname, '../../agentmail/agentmail-docs/current-openapi.json');

    const result = await loadDocs(docsDir, openapiPath);

    // Basic structure
    expect(typeof result).toBe('string');
    expect(result).toContain('# AgentMail Documentation');
    expect(result).toContain('# AgentMail OpenAPI Specification');

    // Size check — full corpus is ~614KB
    const charCount = result.length;
    console.log(`[Integration] Total chars: ${charCount.toLocaleString()}`);
    expect(charCount).toBeGreaterThan(100000);

    // No YAML frontmatter markers at start of sections (after ## File: lines)
    const sections = result.split('## File:');
    for (let i = 1; i < sections.length; i++) {
      const sectionContent = sections[i] ?? '';
      // After the file path line, the content should not start with ---
      const contentAfterHeader = sectionContent.split('\n').slice(2).join('\n').trimStart();
      expect(contentAfterHeader).not.toMatch(/^---/);
    }
  }, 30000); // 30s timeout for integration test
});
