import prisma from "@/lib/prisma";
import { NextRequest as Request, NextResponse as Response } from "next/server";
import { currentUser } from "@clerk/nextjs/server";

export async function GET(_req: Request) {
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
