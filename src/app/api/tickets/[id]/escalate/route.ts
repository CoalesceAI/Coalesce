import prisma from "@/lib/prisma";
import { NextRequest as Request, NextResponse as Response } from "next/server";
import { currentUser } from "@clerk/nextjs/server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const ticket = await prisma.ticket.update({
    where: { id },
    data: { status: "ESCALATED" },
  });

  return Response.json(ticket);
}
