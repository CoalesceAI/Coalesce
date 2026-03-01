# MVP SDK + SES Suppression Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the TypeScript SDK for agent event capture, the event ingestion pipeline, and the SES suppression-list workflow — proving the loop: SDK `capture()` call → event stored → ticket created → SES entry removed → ticket resolved.

**Architecture:** The SDK is a standalone TypeScript package in `packages/sdk/` that agents install and use to send structured events to the platform via `POST /api/events/ingest`. The ingest endpoint uses Bearer token auth (team API key, no Clerk). After storing the event, a processor detects `ses_suppression` event types, creates a Ticket, calls the AWS SES v2 API to remove the suppression entry, records the Resolution, and marks the Ticket resolved. The agent can poll `GET /api/tickets/{id}` for status, or supply a `webhookUrl` in the event payload to receive a POST callback when resolved. An Events log page in the dashboard shows all ingested events.

**Tech Stack:** TypeScript SDK (`packages/sdk/`), `@aws-sdk/client-sesv2`, Next.js App Router, Prisma + PostgreSQL, shadcn/ui.

**Prerequisite — MUST be done before any task in this plan:**
> Plan 1 Task 2 (schema migration: `add_ticket_event_resolution_workflow`) must be applied to the shared database before starting. `prisma/schema.prisma` is already updated in `main` — pull the latest, then run `yarn db:generate` to regenerate the Prisma client. Do NOT run `yarn db:migrate` again; the migration was already applied by Plan 1.

---

## Prerequisites / Environment Setup

Add to `.env.local`:

```
# AWS SES (for SES suppression workflow)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
```

---

## Task 1: SDK Package Skeleton

**Files:**
- Create: `packages/sdk/package.json`
- Create: `packages/sdk/tsconfig.json`
- Create: `packages/sdk/src/index.ts`
- Create: `packages/sdk/src/types.ts`

**Step 1: Create `packages/sdk/package.json`**

```json
{
  "name": "@coalesce/sdk",
  "version": "0.1.0",
  "description": "TypeScript SDK for sending agent events to the Coalesce AI support platform",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

**Step 2: Create `packages/sdk/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "module": "commonjs",
    "lib": ["ES2017"],
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create `packages/sdk/src/types.ts`**

```typescript
export type EventType = "error" | "warning" | "info";

export interface EventContext {
  endpoint?: string;
  request?: unknown;
  response?: unknown;
  errorCode?: string | number;
  errorMessage?: string;
  [key: string]: unknown;
}

export interface CoalesceEvent {
  agentId: string;
  eventType: EventType;
  context: EventContext;
  webhookUrl?: string;      // If provided, platform POSTs resolution payload here on completion
  idempotencyKey?: string;  // Set to a stable hash of your error context to prevent duplicate tickets
  timestamp?: string;       // ISO 8601; defaults to now
}

export interface IngestResponse {
  ticketId: string | null; // ticketId is set if an error event created a ticket
  eventId: string;
  status: "accepted";
}

export interface CoalesceClientOptions {
  apiKey: string;
  baseUrl?: string;     // defaults to https://your-platform.com
  batchSize?: number;   // max events per flush (default: 10)
  flushInterval?: number; // ms between auto-flushes (default: 5000)
}
```

**Step 4: Create `packages/sdk/src/index.ts`** (skeleton only for now)

```typescript
export { CoalesceClient } from "./client";
export type {
  CoalesceEvent,
  EventContext,
  EventType,
  IngestResponse,
  CoalesceClientOptions,
} from "./types";
```

**Step 5: Create `packages/sdk/src/client.ts`** (empty shell)

```typescript
import type {
  CoalesceEvent,
  IngestResponse,
  CoalesceClientOptions,
} from "./types";

export class CoalesceClient {
  private apiKey: string;
  private baseUrl: string;
  private queue: CoalesceEvent[];
  private batchSize: number;
  private flushInterval: number;
  private timer: ReturnType<typeof setInterval> | null;

  constructor(options: CoalesceClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://app.coalesce.ai";
    this.batchSize = options.batchSize ?? 10;
    this.flushInterval = options.flushInterval ?? 5000;
    this.queue = [];
    this.timer = null;
  }

  // Implemented in Task 2
  capture(_event: CoalesceEvent): void {
    throw new Error("Not implemented");
  }

  // Implemented in Task 3
  async flush(): Promise<IngestResponse[]> {
    throw new Error("Not implemented");
  }

  shutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
```

**Step 6: Build to verify TypeScript compiles**

```bash
cd packages/sdk && npm install && npm run build
```

Expected: `dist/index.js` and `dist/index.d.ts` are created, no errors.

**Step 7: Commit**

```bash
git add packages/sdk/
git commit -m "feat: add SDK package skeleton with types and CoalesceClient shell"
```

---

## Task 2: SDK — `capture()` Method

**Files:**
- Modify: `packages/sdk/src/client.ts`

**Step 1: Implement `capture()`**

Replace the `capture` stub:

```typescript
capture(event: CoalesceEvent): void {
  const withTimestamp: CoalesceEvent = {
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
  };
  this.queue.push(withTimestamp);

  if (this.queue.length >= this.batchSize) {
    this.flush().catch(console.error);
  }

  // Start auto-flush timer on first event
  if (!this.timer) {
    this.timer = setInterval(() => {
      if (this.queue.length > 0) {
        this.flush().catch(console.error);
      }
    }, this.flushInterval);
  }
}
```

**Step 2: Rebuild and verify**

```bash
cd packages/sdk && npm run build
```

Expected: no TypeScript errors.

**Step 3: Commit**

```bash
git add packages/sdk/src/client.ts
git commit -m "feat: implement SDK capture() with batching and auto-flush timer"
```

---

## Task 3: SDK — `flush()` with Retry Logic

**Files:**
- Modify: `packages/sdk/src/client.ts`

**Step 1: Implement `flush()` with exponential backoff retry**

Replace the `flush` stub:

```typescript
async flush(): Promise<IngestResponse[]> {
  if (this.queue.length === 0) return [];

  const batch = this.queue.splice(0, this.batchSize);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${this.baseUrl}/api/events/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ events: batch }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json() as { results: IngestResponse[] };
      return data.results;
    } catch (err) {
      const isLastAttempt = attempt === 2;
      if (isLastAttempt) {
        // Re-queue failed events so they aren't dropped
        this.queue.unshift(...batch);
        console.error("[CoalesceSDK] Failed to flush events after 3 attempts:", err);
        return [];
      }
      // Exponential backoff: 200ms, 400ms
      await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt)));
    }
  }

  return [];
}
```

**Step 2: Rebuild and verify**

```bash
cd packages/sdk && npm run build
```

**Step 3: Write a quick smoke test script `packages/sdk/test-smoke.ts`**

```typescript
// Run with: npx ts-node test-smoke.ts
// This requires the dev server to be running at localhost:3000
import { CoalesceClient } from "./src/index";

const client = new CoalesceClient({
  apiKey: "your-team-api-key-here",
  baseUrl: "http://localhost:3000",
  flushInterval: 1000,
});

client.capture({
  agentId: "test-agent-001",
  eventType: "error",
  context: {
    endpoint: "/api/email/send",
    errorCode: "MessageRejected",
    errorMessage: "Email address is on the suppression list",
    email: "bounced@example.com",
  },
  webhookUrl: "http://localhost:3001/webhook", // optional; set to your callback URL
});

console.log("Event captured, waiting for flush...");
setTimeout(async () => {
  await client.flush();
  client.shutdown();
  console.log("Done.");
}, 2000);
```

**Step 4: Commit**

```bash
git add packages/sdk/
git commit -m "feat: implement SDK flush() with exponential backoff retry"
```

---

## Task 4: Event Ingestion API

**Files:**
- Create: `src/app/api/events/ingest/route.ts`
- Modify: `src/middleware.ts`

**Context:** This endpoint is called by agents via the SDK. Auth is a Bearer token matching `team.apiKey` — no Clerk.

**Step 1: Create `src/app/api/events/ingest/route.ts`**

```typescript
import prisma from "@/lib/prisma";
import { NextRequest as Request, NextResponse as Response } from "next/server";
import { after } from "next/server";
import { processEvent } from "@/lib/event-processor";

export async function POST(req: Request) {
  // API key auth: Authorization: Bearer <team.apiKey>
  const authHeader = req.headers.get("authorization") ?? "";
  const apiKey = authHeader.replace("Bearer ", "").trim();

  if (!apiKey) {
    return Response.json({ error: "Missing Authorization header" }, { status: 401 });
  }

  const team = await prisma.team.findUnique({ where: { apiKey } });
  if (!team) {
    return Response.json({ error: "Invalid API key" }, { status: 401 });
  }

  const body = await req.json();
  const events: Array<{
    agentId?: string;
    eventType: string;
    context: Record<string, unknown>;
    webhookUrl?: string;
    timestamp?: string;
  }> = Array.isArray(body.events) ? body.events : [body];

  if (events.length === 0) {
    return Response.json({ error: "No events provided" }, { status: 400 });
  }

  // Store all events
  // Check idempotency keys upfront to avoid duplicate processing
  const idempotencyKeys = events
    .map((e) => e.idempotencyKey)
    .filter(Boolean) as string[];
  const existingKeys =
    idempotencyKeys.length > 0
      ? (
          await prisma.ticket.findMany({
            where: { idempotencyKey: { in: idempotencyKeys } },
            select: { idempotencyKey: true },
          })
        ).map((t) => t.idempotencyKey)
      : [];
  const deduped = events.filter(
    (e) => !e.idempotencyKey || !existingKeys.includes(e.idempotencyKey)
  );

  const created = await prisma.event.createManyAndReturn({
    data: deduped.map((e) => ({
      teamId: team.id,
      agentIdentifier: e.agentId,
      eventType: e.eventType,
      payload: {
        context: e.context,
        // webhookUrl stored in Event payload for reference, but will be promoted
        // to the Ticket.webhookUrl field when the ticket is created in processEvent
        webhookUrl: e.webhookUrl,
        idempotencyKey: e.idempotencyKey,
        timestamp: e.timestamp ?? new Date().toISOString(),
      },
    })),
  });

  // Process each event asynchronously after response
  after(() =>
    Promise.all(created.map((event) => processEvent(event.id).catch(console.error)))
  );

  const results = created.map((e) => ({
    eventId: e.id,
    ticketId: null as string | null, // set after processing
    status: "accepted",
  }));

  return Response.json({ results }, { status: 202 });
}
```

**Step 2: Add the ingest route to public routes in `src/middleware.ts`**

Find the `isPublicRoute` matcher and add:

```typescript
"/api/events/ingest(.*)",
```

So it reads:

```typescript
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/public(.*)",
  "/api/user/create-user(.*)",
  "/api/public(.*)",
  "/api/slack/events(.*)",
  "/api/events/ingest(.*)",
  "/accept-invitation(.*)",
]);
```

**Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/app/api/events/ src/middleware.ts
git commit -m "feat: add event ingest API with API key auth and async processing"
```

---

## Task 5: Event Processor

**Files:**
- Create: `src/lib/event-processor.ts`

**Context:** Called after ingest. Looks at `eventType` and routes to the right workflow. For MVP, handles `ses_suppression` and `email_bounce` types — both map to the SES suppression workflow.

**Step 1: Create `src/lib/event-processor.ts`**

```typescript
import prisma from "./prisma";
import { executeSesSuppressionWorkflow } from "./workflows/ses-suppression";

const SES_EVENT_TYPES = new Set([
  "ses_suppression",
  "email_bounce",
  "email_spam_flag",
  "ses_bounce",
]);

export async function processEvent(eventId: string): Promise<void> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event || event.processed) return;

  // Only process error-like events that match known workflow types
  if (!SES_EVENT_TYPES.has(event.eventType)) {
    // Mark as processed but no action taken
    await prisma.event.update({ where: { id: eventId }, data: { processed: true } });
    return;
  }

  const payload = event.payload as {
    context: {
      email?: string;
      errorMessage?: string;
      endpoint?: string;
      errorCode?: string;
    };
    webhookUrl?: string;
    idempotencyKey?: string;
  };

  const email = payload.context?.email;
  if (!email) {
    console.warn(`[EventProcessor] Event ${eventId} missing email in context`);
    await prisma.event.update({ where: { id: eventId }, data: { processed: true } });
    return;
  }

  // Create a ticket — webhookUrl is a first-class field so the workflow can read it directly
  const ticket = await prisma.ticket.create({
    data: {
      teamId: event.teamId,
      source: "SDK",
      status: "IN_PROGRESS",
      priority: "HIGH",
      category: "API_BUG",
      title: `SES suppression: ${email}`,
      rawContent: JSON.stringify(payload.context, null, 2),
      agentIdentifier: event.agentIdentifier,
      structuredContext: payload.context,
      webhookUrl: payload.webhookUrl ?? null,
      idempotencyKey: payload.idempotencyKey ?? null,
    },
  });

  // Link event to ticket
  await prisma.event.update({
    where: { id: eventId },
    data: { processed: true, ticketId: ticket.id },
  });

  // Execute the SES suppression workflow — it reads webhookUrl from the Ticket record
  await executeSesSuppressionWorkflow(ticket.id, email);
}
```

**Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/lib/event-processor.ts
git commit -m "feat: add event processor that routes SES events to suppression workflow"
```

---

## Task 6: SES Suppression Workflow

**Files:**
- Create: `src/lib/workflows/ses-suppression.ts`

**Step 1: Install AWS SDK**

```bash
yarn add @aws-sdk/client-sesv2
```

**Step 2: Create `src/lib/workflows/ses-suppression.ts`**

```typescript
import {
  SESv2Client,
  DeleteSuppressedDestinationCommand,
  GetSuppressedDestinationCommand,
} from "@aws-sdk/client-sesv2";
import prisma from "@/lib/prisma";

const sesClient = new SESv2Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function isOnSuppressionList(email: string): Promise<boolean> {
  try {
    await sesClient.send(
      new GetSuppressedDestinationCommand({ EmailAddress: email })
    );
    return true;
  } catch (err: unknown) {
    if ((err as { name?: string }).name === "NotFoundException") return false;
    throw err;
  }
}

async function removeFromSuppressionList(email: string): Promise<void> {
  await sesClient.send(
    new DeleteSuppressedDestinationCommand({ EmailAddress: email })
  );
}

async function notifyWebhook(
  webhookUrl: string,
  ticketId: string,
  email: string,
  outcome: "SUCCESS" | "FAILURE",
  message: string
): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId, email, outcome, message }),
    });
  } catch (err) {
    console.error("[SES Workflow] Webhook notification failed:", err);
  }
}

export async function executeSesSuppressionWorkflow(
  ticketId: string,
  email: string
): Promise<void> {
  // Read webhookUrl from the Ticket record — single source of truth
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { webhookUrl: true } });
  const webhookUrl = ticket?.webhookUrl ?? undefined;

  try {
    const onList = await isOnSuppressionList(email);

    if (!onList) {
      // Not suppressed — ticket is resolved immediately (nothing to remove)
      await prisma.resolution.create({
        data: {
          ticketId,
          type: "API_ACTION",
          outcome: "SUCCESS",
          executedAt: new Date(),
          content: {
            email,
            action: "no_action_needed",
            message: `${email} was not on the SES suppression list`,
          },
        },
      });

      await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: "RESOLVED", resolvedAt: new Date() },
      });

      if (webhookUrl) {
        await notifyWebhook(
          webhookUrl,
          ticketId,
          email,
          "SUCCESS",
          `${email} was not on the SES suppression list — no action needed`
        );
      }

      return;
    }

    // Remove from suppression list
    await removeFromSuppressionList(email);

    await prisma.resolution.create({
      data: {
        ticketId,
        type: "API_ACTION",
        outcome: "SUCCESS",
        executedAt: new Date(),
        content: {
          email,
          action: "removed_from_suppression_list",
          message: `${email} successfully removed from SES suppression list`,
        },
      },
    });

    await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });

    if (webhookUrl) {
      await notifyWebhook(
        webhookUrl,
        ticketId,
        email,
        "SUCCESS",
        `${email} successfully removed from SES suppression list`
      );
    }
  } catch (err) {
    console.error("[SES Workflow] Error:", err);

    await prisma.resolution.create({
      data: {
        ticketId,
        type: "API_ACTION",
        outcome: "FAILURE",
        executedAt: new Date(),
        content: { email, error: String(err) },
      },
    });

    await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: "ESCALATED" },
    });

    if (webhookUrl) {
      await notifyWebhook(
        webhookUrl,
        ticketId,
        email,
        "FAILURE",
        `Failed to remove ${email} from SES suppression list — escalated for human review`
      );
    }
  }
}
```

**Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/lib/workflows/ses-suppression.ts yarn.lock package.json
git commit -m "feat: add SES suppression workflow with webhook callback support"
```

---

## Task 7: Events Log Dashboard Page

**Files:**
- Create: `src/app/[team-slug]/events/page.tsx`
- Create: `src/app/[team-slug]/events/_components/events-table.tsx`

**Step 1: Create `src/app/[team-slug]/events/_components/events-table.tsx`**

```typescript
"use client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useParams } from "next/navigation";

type EventRow = {
  id: string;
  eventType: string;
  agentIdentifier: string | null;
  processed: boolean;
  ticketId: string | null;
  createdAt: string;
};

export function EventsTable({ events }: { events: EventRow[] }) {
  const params = useParams();
  const teamSlug = params["team-slug"] as string;

  if (events.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No events yet. Events appear here once agents send data via the SDK.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Event Type</TableHead>
          <TableHead>Agent</TableHead>
          <TableHead>Processed</TableHead>
          <TableHead>Ticket</TableHead>
          <TableHead>Received</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id}>
            <TableCell className="font-mono text-sm">{event.eventType}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {event.agentIdentifier ?? "—"}
            </TableCell>
            <TableCell>
              <Badge variant={event.processed ? "default" : "outline"}>
                {event.processed ? "processed" : "pending"}
              </Badge>
            </TableCell>
            <TableCell>
              {event.ticketId ? (
                <Link
                  href={`/${teamSlug}/tickets/${event.ticketId}`}
                  className="font-mono text-xs hover:underline"
                >
                  {event.ticketId.slice(0, 8)}...
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {new Date(event.createdAt).toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

**Step 2: Create `src/app/[team-slug]/events/page.tsx`**

```typescript
import prisma from "@/lib/prisma";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import PageContainer from "@/components/layouts/page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EventsTable } from "./_components/events-table";

export const metadata = { title: "Events" };

export default async function EventsPage({
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

  const events = await prisma.event.findMany({
    where: { teamId: team.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const serialized = events.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    agentIdentifier: e.agentIdentifier,
    processed: e.processed,
    ticketId: e.ticketId,
    createdAt: e.createdAt.toISOString(),
  }));

  return (
    <PageContainer>
      <div className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">Events</h2>
        <Card>
          <CardHeader>
            <CardTitle>SDK Event Log</CardTitle>
          </CardHeader>
          <CardContent>
            <EventsTable events={serialized} />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
```

**Step 3: Update sidebar — add Events nav item**

In `src/components/layouts/app-sidebar.tsx`, add to the `items` array (after Tickets, before Settings):

```typescript
import { Home, Settings, Ticket, Zap } from "lucide-react";

const items = [
  { title: "Dashboard", url: (teamSlug: string) => `/${teamSlug}/dashboard`, icon: Home },
  { title: "Tickets",   url: (teamSlug: string) => `/${teamSlug}/tickets`,   icon: Ticket },
  { title: "Events",    url: (teamSlug: string) => `/${teamSlug}/events`,    icon: Zap },
  { title: "Settings",  url: (teamSlug: string) => `/${teamSlug}/settings`,  icon: Settings },
];
```

**Step 4: Verify TypeScript and commit**

```bash
npx tsc --noEmit
git add src/app/[team-slug]/events/ src/components/layouts/app-sidebar.tsx
git commit -m "feat: add events log dashboard page and sidebar nav item"
```

---

## Task 8: End-to-End Verification

**Goal:** Confirm the full SDK → ingest → event processor → SES removal → ticket resolved loop.

**Step 1: Get your team's API key**

Open the dashboard → Settings → Developers. Copy the API key.

**Step 2: Update the smoke test script**

In `packages/sdk/test-smoke.ts`, set the `apiKey` to your actual team API key.

**Step 3: Start the dev server**

```bash
# In the root of the project
yarn dev
```

**Step 4: First, add an email to SES suppression list (for testing)**

Using AWS CLI or the AWS Console, add a test address to the account-level suppression list:

```bash
aws sesv2 put-suppressed-destination \
  --email-address bounced@example.com \
  --reason BOUNCE \
  --region us-east-1
```

**Step 5: Run the smoke test**

```bash
cd packages/sdk
npx ts-node test-smoke.ts
```

Expected output:
```
Event captured, waiting for flush...
Done.
```

**Step 6: Verify the event was processed**

Check the database or the Events dashboard page at:
`http://localhost:3000/{team-slug}/events`

Expected: one event with `eventType: "error"` and `processed: true`, with a linked ticket ID.

**Step 7: Verify the ticket was resolved**

Navigate to `http://localhost:3000/{team-slug}/tickets`.

Expected: one ticket with:
- Title: `SES suppression: bounced@example.com`
- Status: `RESOLVED`
- Source: `SDK`

**Step 8: Verify the address was removed from the suppression list**

```bash
aws sesv2 get-suppressed-destination \
  --email-address bounced@example.com \
  --region us-east-1
```

Expected: `NotFoundException` (meaning it was successfully removed).

**Step 9: Final TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

---

## Troubleshooting Notes

- **`createManyAndReturn` not available**: If Prisma throws on `createManyAndReturn`, use `createMany` first then query back: `await prisma.event.createMany({...})` then fetch by a batch ID or use individual `create` calls.
- **`after()` not available**: Fall back to fire-and-forget after response: call `processEvent(id).catch(console.error)` before returning `Response.json(...)`. This risks Vercel killing the process mid-execution; acceptable for MVP.
- **AWS credential errors**: Verify `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` are set. The IAM user needs `ses:DeleteSuppressedDestination` and `ses:GetSuppressedDestination` permissions.
- **SDK `fetch` not available in older Node**: The SDK uses native `fetch` (available in Node 18+). If running Node 16, add `node-fetch` as a dependency and polyfill.
