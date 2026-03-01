"use client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useParams } from "next/navigation";

type EventRow = {
  id: string;
  eventType: string;
  agentIdentifier: string | null;
  processed: boolean;
  ticketId: string | null;
  createdAt: string;
};

export function EventsTable({ events }: { events: EventRow[] }) {
  const params = useParams();
  const teamSlug = params["team-slug"] as string;

  if (events.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No events yet. Events appear here once agents send data via the SDK.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Event Type</TableHead>
          <TableHead>Agent</TableHead>
          <TableHead>Processed</TableHead>
          <TableHead>Ticket</TableHead>
          <TableHead>Received</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id}>
            <TableCell className="font-mono text-sm">{event.eventType}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {event.agentIdentifier ?? "\u2014"}
            </TableCell>
            <TableCell>
              <Badge variant={event.processed ? "default" : "outline"}>
                {event.processed ? "processed" : "pending"}
              </Badge>
            </TableCell>
            <TableCell>
              {event.ticketId ? (
                <Link
                  href={`/${teamSlug}/tickets/${event.ticketId}`}
                  className="font-mono text-xs hover:underline"
                >
                  {event.ticketId.slice(0, 8)}...
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground">{"\u2014"}</span>
              )}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {new Date(event.createdAt).toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
