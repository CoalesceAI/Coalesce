import prisma from "@/lib/prisma";
import { NextRequest as Request, NextResponse as Response } from "next/server";
import { currentUser } from "@clerk/nextjs/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
