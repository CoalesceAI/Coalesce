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
