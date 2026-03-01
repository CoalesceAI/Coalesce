"use client";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { useParams } from "next/navigation";

type Ticket = {
  id: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  source: string;
  createdAt: string;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  OPEN: "outline",
  TRIAGING: "secondary",
  IN_PROGRESS: "secondary",
  RESOLVED: "default",
  ESCALATED: "destructive",
};

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  LOW: "outline",
  MEDIUM: "secondary",
  HIGH: "secondary",
  CRITICAL: "destructive",
};

export function TicketsTable({ tickets }: { tickets: Ticket[] }) {
  const params = useParams();
  const teamSlug = params["team-slug"] as string;

  if (tickets.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No tickets yet. Tickets will appear here once agents start reporting issues via Slack.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tickets.map((ticket) => (
          <TableRow key={ticket.id}>
            <TableCell>
              <Link
                href={`/${teamSlug}/tickets/${ticket.id}`}
                className="font-medium hover:underline"
              >
                {ticket.title}
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[ticket.status] ?? "outline"}>
                {ticket.status}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant={PRIORITY_VARIANT[ticket.priority] ?? "outline"}>
                {ticket.priority}
              </Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{ticket.category}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{ticket.source}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {new Date(ticket.createdAt).toLocaleDateString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
