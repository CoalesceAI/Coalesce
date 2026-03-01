import prisma from "@/lib/prisma";
import { currentUser } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import PageContainer from "@/components/layouts/page-container";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Ticket Detail" };

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ "team-slug": string; id: string }>;
}) {
  const { "team-slug": teamSlug, id } = await params;
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: { resolution: true, team: true },
  });

  if (!ticket || ticket.team.slug !== teamSlug) notFound();

  return (
    <PageContainer>
      <div className="max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold tracking-tight">{ticket.title}</h2>
          <Badge variant="outline">{ticket.status}</Badge>
          <Badge variant="outline">{ticket.priority}</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Raw Content</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 font-mono text-sm">
              {ticket.rawContent}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Triage Classification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Category:</span> {ticket.category}
            </div>
            <div>
              <span className="font-medium">Source:</span> {ticket.source}
            </div>
            <div>
              <span className="font-medium">Agent:</span>{" "}
              {ticket.agentIdentifier ?? "Unknown"}
            </div>
            {ticket.structuredContext && (
              <pre className="overflow-auto rounded-md bg-muted p-4 text-xs">
                {JSON.stringify(ticket.structuredContext, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>

        {ticket.resolution && (
          <Card>
            <CardHeader>
              <CardTitle>Resolution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="font-medium">Type:</span> {ticket.resolution.type}
              </div>
              <div>
                <span className="font-medium">Outcome:</span> {ticket.resolution.outcome}
              </div>
              {ticket.resolution.executedAt && (
                <div>
                  <span className="font-medium">Executed:</span>{" "}
                  {new Date(ticket.resolution.executedAt).toLocaleString()}
                </div>
              )}
              <pre className="overflow-auto rounded-md bg-muted p-4 text-xs">
                {JSON.stringify(ticket.resolution.content, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
