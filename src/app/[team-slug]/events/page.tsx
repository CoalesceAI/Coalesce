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
