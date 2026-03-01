import prisma from "@/lib/prisma";
import { NextRequest as Request, NextResponse as Response } from "next/server";
import { after } from "next/server";
import { processEvent } from "@/lib/event-processor";

export async function POST(req: Request) {
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
    idempotencyKey?: string;
    timestamp?: string;
  }> = Array.isArray(body.events) ? body.events : [body];

  if (events.length === 0) {
    return Response.json({ error: "No events provided" }, { status: 400 });
  }

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

  const created = await Promise.all(
    deduped.map((e) =>
      prisma.event.create({
        data: {
          teamId: team.id,
          agentIdentifier: e.agentId,
          eventType: e.eventType,
          payload: {
            context: e.context,
            webhookUrl: e.webhookUrl,
            idempotencyKey: e.idempotencyKey,
            timestamp: e.timestamp ?? new Date().toISOString(),
          },
        },
      })
    )
  );

  after(() =>
    Promise.all(created.map((event) => processEvent(event.id).catch(console.error)))
  );

  const results = created.map((e) => ({
    eventId: e.id,
    ticketId: null as string | null,
    status: "accepted" as const,
  }));

  return Response.json({ results }, { status: 202 });
}
