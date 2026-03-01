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
