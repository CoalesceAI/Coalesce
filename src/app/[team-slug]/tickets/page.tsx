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
