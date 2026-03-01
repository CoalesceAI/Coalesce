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
