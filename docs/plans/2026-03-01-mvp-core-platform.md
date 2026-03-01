# MVP Core Platform Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the core platform loop — Slack message from an agent → LLM triage → Fern docs update workflow → resolution confirmation back in Slack thread — plus the operator dashboard to monitor tickets.

**Architecture:** A Slack Events API endpoint receives messages from agents (app_mention or direct message). An LLM triage engine classifies the ticket using Claude claude-sonnet-4-6 and routes it to the appropriate hardcoded workflow. For docs issues, the docs-update workflow uses LLM to generate a fix, writes it to a local `fern/pages/` directory, and notifies the agent in the Slack thread. All ticket lifecycle state is stored in Postgres via Prisma. A new Tickets section in the dashboard lets operators monitor, inspect, and manually override tickets.

**Tech Stack:** Next.js 16 App Router, `@slack/web-api` (Slack message sending + signature verification), `@anthropic-ai/sdk` (triage + doc generation), Prisma + PostgreSQL, shadcn/ui (Table, Badge, Card), TypeScript.

**Scope:** This plan covers Abhinit's MVP work only. Tanishq's SDK + Event pipeline + SES workflow is separate.

---

## Prerequisites / Environment Setup

Before starting, ensure the following env vars are set in `.env.local`:

```
# Existing
DATABASE_URL=...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
NEXT_PUBLIC_APP_URL=...

# New — add these
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
ANTHROPIC_API_KEY=sk-ant-...
FERN_DOCS_PATH=./fern/pages
```

Slack app setup (do this before Task 5):
1. Go to https://api.slack.com/apps → Create New App → "From scratch"
2. Name it **"Coalesce AI"**, pick your workspace
3. Under **OAuth & Permissions** → Bot Token Scopes: add `chat:write`, `app_mentions:read`, `channels:history`
4. Under **Event Subscriptions** → Enable → set Request URL to `{NEXT_PUBLIC_APP_URL}/api/slack/events`
5. Subscribe to bot events: `app_mention`
6. Under **Basic Information** → copy Signing Secret → set `SLACK_SIGNING_SECRET`
7. Install app to workspace → copy Bot User OAuth Token → set `SLACK_BOT_TOKEN`

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json` (via yarn)

**Step 1: Install new packages**

```bash
yarn add @slack/web-api @anthropic-ai/sdk
```

**Step 2: Verify TypeScript is happy**

```bash
npx tsc --noEmit
```
Expected: no errors (new packages ship with types).

**Step 3: Commit**

```bash
git add package.json yarn.lock
git commit -m "feat: add @slack/web-api and @anthropic-ai/sdk dependencies"
```

---

## Task 2: Run Schema Migration

**Context:** `prisma/schema.prisma` is already updated with all required models (Ticket, Event, Resolution) plus three additional fields identified during planning: `idempotencyKey` on Ticket (prevents duplicate tickets from agent retries), `webhookUrl` on Ticket (first-class callback URL), and `slackWorkspaceId` on Team (routes Slack events to the correct team). The `Workflow` model was intentionally excluded as YAGNI for MVP.

**Also add to `.env.local`:**

```
SLACK_WORKSPACE_ID=T...   # Your Slack workspace ID
                           # Find it: open Slack → right-click workspace name → "Copy link"
                           # It's the capital-T string in the URL (e.g., T01ABC123)
```

**Step 1: Run migration**

```bash
yarn db:migrate
```
When prompted for the migration name, enter: `add_ticket_event_resolution_workflow`

Expected output: `Your database is now in sync with your schema.`

**Step 2: Regenerate Prisma client**

```bash
yarn db:generate
```

**Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add Ticket, Event, Resolution models to Prisma schema"
```

---

## Task 3: Ticket API Routes

**Files:**
- Create: `src/app/api/tickets/list/route.ts`
- Create: `src/app/api/tickets/create/route.ts`
- Create: `src/app/api/tickets/[id]/route.ts`
- Create: `src/app/api/tickets/[id]/resolve/route.ts`
- Create: `src/app/api/tickets/[id]/escalate/route.ts`

**Step 1: Create `src/app/api/tickets/list/route.ts`**

```typescript
import prisma from "@/lib/prisma";
import { NextRequest as Request, NextResponse as Response } from "next/server";
import { currentUser } from "@clerk/nextjs/server";

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({ where: { authId: user.id } });
  if (!dbUser) return Response.json({ error: "User not found" }, { status: 404 });

  const team = await prisma.team.findFirst({
    where: { members: { some: { userId: dbUser.id } } },
  });
  if (!team) return Response.json({ error: "Team not found" }, { status: 404 });

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const category = searchParams.get("category");

  const tickets = await prisma.ticket.findMany({
    where: {
      teamId: team.id,
      ...(status ? { status: status as any } : {}),
      ...(category ? { category: category as any } : {}),
    },
    include: { resolution: true },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(tickets);
}
```

**Step 2: Create `src/app/api/tickets/create/route.ts`**

```typescript
import prisma from "@/lib/prisma";
import { NextRequest as Request, NextResponse as Response } from "next/server";
import { currentUser } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({ where: { authId: user.id } });
  if (!dbUser) return Response.json({ error: "User not found" }, { status: 404 });

  const team = await prisma.team.findFirst({
    where: { members: { some: { userId: dbUser.id } } },
  });
  if (!team) return Response.json({ error: "Team not found" }, { status: 404 });

  const body = await req.json();
  const { title, rawContent, source, agentIdentifier, structuredContext, slackChannelId, slackThreadTs } = body;

  if (!title || !rawContent) {
    return Response.json({ error: "title and rawContent are required" }, { status: 400 });
  }

  const ticket = await prisma.ticket.create({
    data: {
      teamId: team.id,
      title,
      rawContent,
      source: source || "SLACK",
      agentIdentifier,
      structuredContext,
      slackChannelId,
      slackThreadTs,
    },
  });

  return Response.json(ticket, { status: 201 });
}
```

**Step 3: Create `src/app/api/tickets/[id]/route.ts`**

```typescript
import prisma from "@/lib/prisma";
import { NextRequest as Request, NextResponse as Response } from "next/server";
import { currentUser } from "@clerk/nextjs/server";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: { resolution: true, events: true },
  });
  if (!ticket) return Response.json({ error: "Ticket not found" }, { status: 404 });

  return Response.json(ticket);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const { status, priority, category } = body;

  const ticket = await prisma.ticket.update({
    where: { id },
    data: {
      ...(status && { status }),
      ...(priority && { priority }),
      ...(category && { category }),
    },
  });

  return Response.json(ticket);
}
```

**Step 4: Create `src/app/api/tickets/[id]/resolve/route.ts`**

```typescript
import prisma from "@/lib/prisma";
import { NextRequest as Request, NextResponse as Response } from "next/server";
import { currentUser } from "@clerk/nextjs/server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const { type, content, outcome } = body;

  await prisma.$transaction([
    prisma.ticket.update({
      where: { id },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    }),
    prisma.resolution.upsert({
      where: { ticketId: id },
      create: {
        ticketId: id,
        type,
        content,
        outcome: outcome || "SUCCESS",
        executedAt: new Date(),
      },
      update: {
        type,
        content,
        outcome: outcome || "SUCCESS",
        executedAt: new Date(),
      },
    }),
  ]);

  const ticket = await prisma.ticket.findUnique({ where: { id }, include: { resolution: true } });
  return Response.json(ticket);
}
```

**Step 5: Create `src/app/api/tickets/[id]/escalate/route.ts`**

```typescript
import prisma from "@/lib/prisma";
import { NextRequest as Request, NextResponse as Response } from "next/server";
import { currentUser } from "@clerk/nextjs/server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const ticket = await prisma.ticket.update({
    where: { id },
    data: { status: "ESCALATED" },
  });

  return Response.json(ticket);
}
```

**Step 6: Verify TypeScript**

```bash
npx tsc --noEmit
```

**Step 7: Commit**

```bash
git add src/app/api/tickets/
git commit -m "feat: add ticket CRUD, resolve, and escalate API routes"
```

---

## Task 4: Analytics API Route

**Files:**
- Create: `src/app/api/analytics/overview/route.ts`

**Step 1: Create `src/app/api/analytics/overview/route.ts`**

```typescript
import prisma from "@/lib/prisma";
import { NextRequest as Request, NextResponse as Response } from "next/server";
import { currentUser } from "@clerk/nextjs/server";

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({ where: { authId: user.id } });
  if (!dbUser) return Response.json({ error: "User not found" }, { status: 404 });

  const team = await prisma.team.findFirst({
    where: { members: { some: { userId: dbUser.id } } },
  });
  if (!team) return Response.json({ error: "Team not found" }, { status: 404 });

  const [total, open, triaging, inProgress, resolved, escalated] = await Promise.all([
    prisma.ticket.count({ where: { teamId: team.id } }),
    prisma.ticket.count({ where: { teamId: team.id, status: "OPEN" } }),
    prisma.ticket.count({ where: { teamId: team.id, status: "TRIAGING" } }),
    prisma.ticket.count({ where: { teamId: team.id, status: "IN_PROGRESS" } }),
    prisma.ticket.count({ where: { teamId: team.id, status: "RESOLVED" } }),
    prisma.ticket.count({ where: { teamId: team.id, status: "ESCALATED" } }),
  ]);

  const resolvedTickets = await prisma.ticket.findMany({
    where: { teamId: team.id, status: "RESOLVED", resolvedAt: { not: null } },
    select: { createdAt: true, resolvedAt: true },
  });

  const avgResolutionMs =
    resolvedTickets.length > 0
      ? resolvedTickets.reduce(
          (sum, t) => sum + (t.resolvedAt!.getTime() - t.createdAt.getTime()),
          0
        ) / resolvedTickets.length
      : 0;

  return Response.json({
    total,
    byStatus: { open, triaging, inProgress, resolved, escalated },
    resolutionRate: total > 0 ? Math.round((resolved / total) * 100) : 0,
    avgResolutionMinutes: Math.round(avgResolutionMs / 60000),
  });
}
```

**Step 2: Verify and commit**

```bash
npx tsc --noEmit
git add src/app/api/analytics/
git commit -m "feat: add analytics overview API route"
```

---

## Task 5: Slack Helper and Events Endpoint

**Files:**
- Create: `src/lib/slack.ts`
- Create: `src/app/api/slack/events/route.ts`
- Modify: `src/middleware.ts`

**Step 1: Create `src/lib/slack.ts`**

```typescript
import { WebClient } from "@slack/web-api";
import crypto from "crypto";

if (!process.env.SLACK_BOT_TOKEN) {
  throw new Error("SLACK_BOT_TOKEN is required");
}

export const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

export function verifySlackSignature(
  signingSecret: string,
  rawBody: string,
  timestamp: string,
  signature: string
): boolean {
  const baseString = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac("sha256", signingSecret);
  hmac.update(baseString);
  const computed = `v0=${hmac.digest("hex")}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function replyToThread(
  channelId: string,
  threadTs: string,
  text: string
) {
  return slackClient.chat.postMessage({
    channel: channelId,
    thread_ts: threadTs,
    text,
  });
}
```

**Step 2: Create `src/app/api/slack/events/route.ts`**

```typescript
import { NextRequest as Request, NextResponse as Response } from "next/server";
import { after } from "next/server";
import { verifySlackSignature } from "@/lib/slack";
import { triggerTriageForSlackMessage } from "@/lib/triage";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";
  const signature = req.headers.get("x-slack-signature") ?? "";
  const signingSecret = process.env.SLACK_SIGNING_SECRET!;

  if (!verifySlackSignature(signingSecret, rawBody, timestamp, signature)) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);

  // URL verification challenge (Slack sends this when you first set up the endpoint)
  if (body.type === "url_verification") {
    return Response.json({ challenge: body.challenge });
  }

  const event = body.event;
  if (event && event.type === "app_mention" && !event.bot_id) {
    // Use after() to run triage after the 200 response is sent — avoids Slack's 3s timeout
    after(() =>
      triggerTriageForSlackMessage({
        channelId: event.channel,
        threadTs: event.thread_ts ?? event.ts,
        text: event.text,
        userId: event.user,
      }).catch(console.error)
    );
  }

  return Response.json({ ok: true });
}
```

**Step 3: Modify `src/middleware.ts` — add Slack route to public routes**

Find this line in `src/middleware.ts`:
```typescript
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/public(.*)",
  "/api/user/create-user(.*)",
  "/api/public(.*)",
  "/accept-invitation(.*)",
]);
```

Replace with:
```typescript
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/public(.*)",
  "/api/user/create-user(.*)",
  "/api/public(.*)",
  "/api/slack/events(.*)",
  "/accept-invitation(.*)",
]);
```

**Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add src/lib/slack.ts src/app/api/slack/ src/middleware.ts
git commit -m "feat: add Slack events endpoint with HMAC signature verification"
```

---

## Task 6: Anthropic Client + Triage Engine

**Files:**
- Create: `src/lib/anthropic.ts`
- Create: `src/lib/triage.ts`

**Step 1: Create `src/lib/anthropic.ts`**

```typescript
import Anthropic from "@anthropic-ai/sdk";

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is required");
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
```

**Step 2: Create `src/lib/triage.ts`**

```typescript
import { anthropic } from "./anthropic";
import { replyToThread } from "./slack";
import prisma from "./prisma";
import { executeDocsUpdateWorkflow } from "./workflows/docs-update";

export interface SlackMessage {
  channelId: string;
  threadTs: string;
  text: string;
  userId: string;
}

export interface TriageResult {
  category: "DOCS_ISSUE" | "API_BUG" | "CONFIG_ERROR" | "BILLING" | "UNKNOWN";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  vendor: string;
  endpoint: string | null;
  errorCode: string | null;
  summary: string;
  confidence: number;
}

async function classifyTicket(rawContent: string): Promise<TriageResult> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `You are a triage engine for an AI agent support platform. Classify this support message and extract structured context.

Message:
${rawContent}

Respond ONLY with a JSON object matching this exact schema (no markdown fences, just raw JSON):
{
  "category": "DOCS_ISSUE" | "API_BUG" | "CONFIG_ERROR" | "BILLING" | "UNKNOWN",
  "priority": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "vendor": "string (e.g. Stripe, Twilio, AgentMail, Unknown)",
  "endpoint": "string | null (e.g. /v1/charges)",
  "errorCode": "string | null (e.g. 404, invalid_api_key)",
  "summary": "string (one sentence)",
  "confidence": 0.0-1.0
}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text.trim() : "{}";
  try {
    return JSON.parse(text) as TriageResult;
  } catch {
    return {
      category: "UNKNOWN",
      priority: "MEDIUM",
      vendor: "Unknown",
      endpoint: null,
      errorCode: null,
      summary: rawContent.slice(0, 120),
      confidence: 0,
    };
  }
}

export async function triggerTriageForSlackMessage(msg: SlackMessage) {
  // Look up team by Slack workspace ID. Set SLACK_WORKSPACE_ID in .env.local.
  // Fallback to findFirst() only for single-team dev environments.
  const slackWorkspaceId = process.env.SLACK_WORKSPACE_ID;
  const team = slackWorkspaceId
    ? await prisma.team.findUnique({ where: { slackWorkspaceId } })
    : await prisma.team.findFirst();
  if (!team) {
    console.error("[Triage] No team found for Slack workspace:", slackWorkspaceId ?? "(any)");
    return;
  }

  // Idempotency: Slack retries events on timeout — deduplicate by channel+thread
  const idempotencyKey = `slack:${msg.channelId}:${msg.threadTs}`;
  const existing = await prisma.ticket.findUnique({ where: { idempotencyKey } });
  if (existing) {
    console.log("[Triage] Duplicate Slack event, skipping:", idempotencyKey);
    return;
  }

  await replyToThread(msg.channelId, msg.threadTs, "Received your report. Triaging now...");

  const triage = await classifyTicket(msg.text);

  const ticket = await prisma.ticket.create({
    data: {
      teamId: team.id,
      source: "SLACK",
      status: "TRIAGING",
      priority: triage.priority,
      category: triage.category,
      title: triage.summary,
      rawContent: msg.text,
      agentIdentifier: msg.userId,
      slackChannelId: msg.channelId,
      slackThreadTs: msg.threadTs,
      idempotencyKey,
      structuredContext: {
        vendor: triage.vendor,
        endpoint: triage.endpoint,
        errorCode: triage.errorCode,
        confidence: triage.confidence,
      },
    },
  });

  await replyToThread(
    msg.channelId,
    msg.threadTs,
    `Classified as *${triage.category}* (vendor: ${triage.vendor}). Running resolution workflow...`
  );

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: "IN_PROGRESS" },
  });

  if (triage.category === "DOCS_ISSUE") {
    await executeDocsUpdateWorkflow(
      ticket.id,
      msg.text,
      triage,
      msg.channelId,
      msg.threadTs
    );
  } else {
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: "ESCALATED" },
    });
    await replyToThread(
      msg.channelId,
      msg.threadTs,
      `Category *${triage.category}* is not handled by an automated workflow. Ticket escalated for human review.`
    );
  }
}
```

**Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/lib/anthropic.ts src/lib/triage.ts
git commit -m "feat: add triage engine with LLM classification and Slack routing"
```

---

## Task 7: Fern Test Docs Directory + Docs-Update Workflow

**Files:**
- Create: `fern/pages/test-api.md` (test target document)
- Create: `src/lib/workflows/docs-update.ts`

**Step 1: Create the Fern test docs directory and sample doc**

```bash
mkdir -p fern/pages
```

Create `fern/pages/test-api.md` with this content:

```markdown
# Test API Reference

## POST /test/endpoint

Creates a test resource.

**Parameters:**
- `name` (string, required): The resource name.

**Example:**

```http
POST /test/endpoint
Content-Type: application/json

{ "name": "my-resource" }
```

**Response:**

```json
{ "id": "res_123", "name": "my-resource", "created": true }
```
```

Add a `.gitkeep` to the `fern/` directory and ensure it is tracked (the docs files should be committed so the workflow can read/write them).

**Step 2: Create `src/lib/workflows/docs-update.ts`**

```typescript
import { anthropic } from "@/lib/anthropic";
import { replyToThread } from "@/lib/slack";
import prisma from "@/lib/prisma";
import type { TriageResult } from "@/lib/triage";
import fs from "fs/promises";
import path from "path";

async function findDocFile(endpoint: string | null, docsPath: string): Promise<string | null> {
  let files: string[] = [];
  try {
    files = await fs.readdir(docsPath);
  } catch {
    return null;
  }

  if (endpoint) {
    const slug = endpoint.replace(/\//g, "-").replace(/^-/, "").toLowerCase();
    const match = files.find(
      (f) => f.toLowerCase().includes(slug) || slug.includes(f.replace(".md", "").toLowerCase())
    );
    if (match) return path.join(docsPath, match);
  }

  const mdFile = files.find((f) => f.endsWith(".md"));
  return mdFile ? path.join(docsPath, mdFile) : null;
}

async function generateDocFix(currentContent: string, issueDescription: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are a technical documentation editor. An AI agent reported the following documentation issue:

ISSUE:
${issueDescription}

CURRENT DOCUMENTATION:
${currentContent}

Rewrite the documentation to address the reported issue. Make minimal, targeted changes that resolve the problem. Return ONLY the updated documentation content — no preamble, no explanation.`,
      },
    ],
  });

  return response.content[0].type === "text" ? response.content[0].text : currentContent;
}

export async function executeDocsUpdateWorkflow(
  ticketId: string,
  issueText: string,
  triage: TriageResult,
  slackChannelId: string,
  slackThreadTs: string
) {
  const docsPath = process.env.FERN_DOCS_PATH ?? "./fern/pages";

  try {
    const docFilePath = await findDocFile(triage.endpoint, docsPath);

    if (!docFilePath) {
      await replyToThread(
        slackChannelId,
        slackThreadTs,
        "Could not locate a relevant documentation file. Escalating for human review."
      );
      await prisma.ticket.update({ where: { id: ticketId }, data: { status: "ESCALATED" } });
      return;
    }

    const originalContent = await fs.readFile(docFilePath, "utf-8");
    const fileName = path.basename(docFilePath);

    await replyToThread(
      slackChannelId,
      slackThreadTs,
      `Found documentation file: \`${fileName}\`. Generating fix...`
    );

    const updatedContent = await generateDocFix(originalContent, issueText);

    await fs.writeFile(docFilePath, updatedContent, "utf-8");

    await prisma.resolution.create({
      data: {
        ticketId,
        type: "DOCS_UPDATE",
        outcome: "SUCCESS",
        executedAt: new Date(),
        content: {
          filePath: docFilePath,
          fileName,
          originalContent,
          updatedContent,
        },
      },
    });

    await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });

    await replyToThread(
      slackChannelId,
      slackThreadTs,
      `Documentation updated successfully.\n\n*File:* \`${fileName}\`\n\nTo publish, commit the updated file and push to your Fern docs repository.`
    );
  } catch (err) {
    console.error("Docs update workflow error:", err);

    await prisma.ticket.update({ where: { id: ticketId }, data: { status: "ESCALATED" } });

    await prisma.resolution.create({
      data: {
        ticketId,
        type: "DOCS_UPDATE",
        outcome: "FAILURE",
        executedAt: new Date(),
        content: { error: String(err) },
      },
    });

    await replyToThread(
      slackChannelId,
      slackThreadTs,
      "The docs update workflow encountered an error. Ticket escalated for human review."
    );
  }
}
```

**Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add fern/ src/lib/workflows/
git commit -m "feat: add docs-update workflow and Fern test docs directory"
```

---

## Task 8: Dashboard — Tickets List Page

**Files:**
- Create: `src/app/[team-slug]/tickets/_components/tickets-table.tsx`
- Create: `src/app/[team-slug]/tickets/page.tsx`

**Step 1: Create `src/app/[team-slug]/tickets/_components/tickets-table.tsx`**

```typescript
"use client";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { useParams } from "next/navigation";

type Ticket = {
  id: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  source: string;
  createdAt: string;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  OPEN: "outline",
  TRIAGING: "secondary",
  IN_PROGRESS: "secondary",
  RESOLVED: "default",
  ESCALATED: "destructive",
};

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  LOW: "outline",
  MEDIUM: "secondary",
  HIGH: "secondary",
  CRITICAL: "destructive",
};

export function TicketsTable({ tickets }: { tickets: Ticket[] }) {
  const params = useParams();
  const teamSlug = params["team-slug"] as string;

  if (tickets.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No tickets yet. Tickets will appear here once agents start reporting issues via Slack.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tickets.map((ticket) => (
          <TableRow key={ticket.id}>
            <TableCell>
              <Link
                href={`/${teamSlug}/tickets/${ticket.id}`}
                className="font-medium hover:underline"
              >
                {ticket.title}
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[ticket.status] ?? "outline"}>
                {ticket.status}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant={PRIORITY_VARIANT[ticket.priority] ?? "outline"}>
                {ticket.priority}
              </Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{ticket.category}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{ticket.source}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {new Date(ticket.createdAt).toLocaleDateString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

**Step 2: Create `src/app/[team-slug]/tickets/page.tsx`**

```typescript
import prisma from "@/lib/prisma";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/layouts/page-container";
import { TicketsTable } from "./_components/tickets-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Tickets" };

export default async function TicketsPage({
  params,
}: {
  params: Promise<{ "team-slug": string }>;
}) {
  const { "team-slug": teamSlug } = await params;
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const dbUser = await prisma.user.findUnique({ where: { authId: user.id } });
  if (!dbUser) redirect("/sign-in");

  const team = await prisma.team.findUnique({
    where: { slug: teamSlug },
    include: { members: { where: { userId: dbUser.id } } },
  });
  if (!team || team.members.length === 0) redirect("/create-team");

  const tickets = await prisma.ticket.findMany({
    where: { teamId: team.id },
    include: { resolution: true },
    orderBy: { createdAt: "desc" },
  });

  const serialized = tickets.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    category: t.category,
    source: t.source,
    createdAt: t.createdAt.toISOString(),
  }));

  return (
    <PageContainer>
      <div className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">Tickets</h2>
        <Card>
          <CardHeader>
            <CardTitle>All Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <TicketsTable tickets={serialized} />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
```

**Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/app/[team-slug]/tickets/
git commit -m "feat: add tickets list dashboard page with status and priority badges"
```

---

## Task 9: Dashboard — Ticket Detail Page

**Files:**
- Create: `src/app/[team-slug]/tickets/[id]/page.tsx`

**Step 1: Create `src/app/[team-slug]/tickets/[id]/page.tsx`**

```typescript
import prisma from "@/lib/prisma";
import { currentUser } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import PageContainer from "@/components/layouts/page-container";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Ticket Detail" };

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ "team-slug": string; id: string }>;
}) {
  const { "team-slug": teamSlug, id } = await params;
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: { resolution: true, team: true },
  });

  if (!ticket || ticket.team.slug !== teamSlug) notFound();

  return (
    <PageContainer>
      <div className="max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold tracking-tight">{ticket.title}</h2>
          <Badge variant="outline">{ticket.status}</Badge>
          <Badge variant="outline">{ticket.priority}</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Raw Content</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 font-mono text-sm">
              {ticket.rawContent}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Triage Classification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Category:</span> {ticket.category}
            </div>
            <div>
              <span className="font-medium">Source:</span> {ticket.source}
            </div>
            <div>
              <span className="font-medium">Agent:</span>{" "}
              {ticket.agentIdentifier ?? "Unknown"}
            </div>
            {ticket.structuredContext && (
              <pre className="overflow-auto rounded-md bg-muted p-4 text-xs">
                {JSON.stringify(ticket.structuredContext, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>

        {ticket.resolution && (
          <Card>
            <CardHeader>
              <CardTitle>Resolution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="font-medium">Type:</span> {ticket.resolution.type}
              </div>
              <div>
                <span className="font-medium">Outcome:</span> {ticket.resolution.outcome}
              </div>
              {ticket.resolution.executedAt && (
                <div>
                  <span className="font-medium">Executed:</span>{" "}
                  {new Date(ticket.resolution.executedAt).toLocaleString()}
                </div>
              )}
              <pre className="overflow-auto rounded-md bg-muted p-4 text-xs">
                {JSON.stringify(ticket.resolution.content, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
```

**Step 2: Verify TypeScript and commit**

```bash
npx tsc --noEmit
git add src/app/[team-slug]/tickets/
git commit -m "feat: add ticket detail page with resolution and structured context"
```

---

## Task 10: Update Dashboard Overview with Real Ticket Analytics

**Files:**
- Modify: `src/app/[team-slug]/dashboard/page.tsx`
- Modify: `src/app/[team-slug]/dashboard/_components/overview.tsx`

**Step 1: Rewrite `src/app/[team-slug]/dashboard/page.tsx` as async server component**

```typescript
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import OverViewPage from "./_components/overview";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ "team-slug": string }>;
}) {
  const { "team-slug": teamSlug } = await params;
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const dbUser = await prisma.user.findUnique({ where: { authId: user.id } });
  const team = dbUser
    ? await prisma.team.findUnique({ where: { slug: teamSlug } })
    : null;

  if (!team) redirect("/create-team");

  const [total, resolved, open, escalated] = await Promise.all([
    prisma.ticket.count({ where: { teamId: team.id } }),
    prisma.ticket.count({ where: { teamId: team.id, status: "RESOLVED" } }),
    prisma.ticket.count({ where: { teamId: team.id, status: "OPEN" } }),
    prisma.ticket.count({ where: { teamId: team.id, status: "ESCALATED" } }),
  ]);

  const recentTickets = await prisma.ticket.findMany({
    where: { teamId: team.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, title: true, status: true, createdAt: true },
  });

  return (
    <OverViewPage
      stats={{ total, resolved, open, escalated }}
      recentTickets={recentTickets.map((t) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
      }))}
    />
  );
}
```

**Step 2: Update `src/app/[team-slug]/dashboard/_components/overview.tsx`**

Replace the mock stat cards and `RecentSales` component with props-driven ticket stats and a recent-tickets mini-list:

```typescript
import PageContainer from "@/components/layouts/page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Ticket, CheckCircle2, AlertCircle, BarChart3 } from "lucide-react";

type Props = {
  stats: { total: number; resolved: number; open: number; escalated: number };
  recentTickets: { id: string; title: string; status: string; createdAt: string }[];
};

export default function OverViewPage({ stats, recentTickets }: Props) {
  const resolutionRate =
    stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0;

  return (
    <PageContainer scrollable>
      <div className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tickets</CardTitle>
              <Ticket className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Resolved</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.resolved}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.open}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Escalated</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.escalated}</div>
              <p className="text-xs text-muted-foreground">
                {resolutionRate}% resolution rate
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            {recentTickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tickets yet.</p>
            ) : (
              <ul className="space-y-2">
                {recentTickets.map((t) => (
                  <li key={t.id} className="flex items-center justify-between text-sm">
                    <span className="truncate font-medium">{t.title}</span>
                    <Badge variant="outline" className="ml-2 shrink-0">
                      {t.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
```

**Step 3: Delete the now-unused `recent-sales.tsx` file**

```bash
rm src/app/[team-slug]/dashboard/_components/recent-sales.tsx
```

**Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add src/app/[team-slug]/dashboard/
git commit -m "feat: replace dashboard mock data with real ticket analytics"
```

---

## Task 11: Update Sidebar Navigation

**Files:**
- Modify: `src/components/layouts/app-sidebar.tsx`

**Step 1: Add Tickets nav item**

In `src/components/layouts/app-sidebar.tsx`, replace the `items` array and imports:

```typescript
import { Home, Settings, Ticket } from "lucide-react";

const items = [
  {
    title: "Dashboard",
    url: (teamSlug: string) => `/${teamSlug}/dashboard`,
    icon: Home,
  },
  {
    title: "Tickets",
    url: (teamSlug: string) => `/${teamSlug}/tickets`,
    icon: Ticket,
  },
  {
    title: "Settings",
    url: (teamSlug: string) => `/${teamSlug}/settings`,
    icon: Settings,
  },
];
```

**Step 2: Verify TypeScript and commit**

```bash
npx tsc --noEmit
git add src/components/layouts/app-sidebar.tsx
git commit -m "feat: add Tickets nav item to sidebar"
```

---

## Task 12: End-to-End Verification

**Goal:** Confirm the full loop works: Slack @mention → triage → docs update → Slack reply → ticket visible in dashboard.

**Step 1: Start the dev server**

```bash
yarn dev
```

Expected: server starts on `http://localhost:3000`.

**Step 2: Start ngrok**

```bash
ngrok http 3000
```

Copy the public URL (e.g., `https://abc123.ngrok-free.app`).

**Step 3: Update Slack Event Subscriptions URL**

In your Slack app at api.slack.com → **Event Subscriptions** → set Request URL to:
`https://abc123.ngrok-free.app/api/slack/events`

Slack will call the URL to verify it. Expected: green checkmark ("Verified").

**Step 4: Invite bot to a channel**

In Slack: `/invite @Coalesce AI`

**Step 5: Mention the bot with a test issue**

Send this message in the channel:

```
@Coalesce AI My AI agent is getting a 404 on the /test/endpoint route. The documentation says POST /test/endpoint should accept a "name" field and return a resource object, but we're getting "endpoint not found". Can you check if the docs are accurate?
```

**Step 6: Verify the flow**

Observe the bot replies in the thread:
1. "Received your report. Triaging now..."
2. "Classified as DOCS_ISSUE (vendor: Unknown). Running resolution workflow..."
3. "Found documentation file: `test-api.md`. Generating fix..."
4. "Documentation updated successfully..."

**Step 7: Verify the doc was updated**

```bash
cat fern/pages/test-api.md
```

Expected: the file content has changed from the original.

**Step 8: Verify ticket in dashboard**

1. Open `http://localhost:3000/{your-team-slug}/tickets`
2. Expected: one ticket appears with status `RESOLVED`, category `DOCS_ISSUE`
3. Click the ticket — verify structured context and resolution content are shown

**Step 9: Final TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

---

## Troubleshooting Notes

- **`after()` not available**: If `next/server` doesn't export `after`, fall back to fire-and-forget: `triggerTriageForSlackMessage(...).catch(console.error);` and return `Response.json({ ok: true })` immediately.
- **Slack signature mismatch**: Ensure `SLACK_SIGNING_SECRET` is set correctly. Check that `rawBody` in the route is the raw bytes, not parsed JSON.
- **LLM returns non-JSON**: The triage function has a `try/catch` that falls back to `UNKNOWN` — check server logs for the raw response.
- **`fern/pages/` not found**: Ensure `FERN_DOCS_PATH` in `.env.local` points to the correct absolute or relative path. Relative paths resolve from the Next.js project root.
- **Team not found in triage**: Ensure `SLACK_WORKSPACE_ID` is set in `.env.local`. If omitted, falls back to `team.findFirst()` — fine for single-team dev. Workspace ID is the `T...` string in your Slack URL.
