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
