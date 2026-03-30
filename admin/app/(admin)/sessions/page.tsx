import { auth } from "@clerk/nextjs/server";
import { adminFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { Suspense } from "react";
import { SessionFilters } from "./session-filters";

interface Session {
  id: string;
  org_id: string | null;
  org_name: string | null;
  org_slug: string | null;
  external_customer_id: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  turn_count: number;
}

interface SessionsResponse {
  sessions: Session[];
  total: number;
  limit: number;
  offset: number;
}

const STATUS_COLORS: Record<string, string> = {
  resolved: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/25",
  needs_info: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  unknown: "bg-stone-500/15 text-stone-600 dark:text-stone-400 border-stone-500/25",
  active: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25",
};

function sessionsHref(
  p: Record<string, string | undefined>,
  pageNum: number,
): string {
  const q = new URLSearchParams();
  if (p.status) q.set("status", p.status);
  if (p.org) q.set("org", p.org);
  if (p.q) q.set("q", p.q);
  q.set("page", String(pageNum));
  return `/sessions?${q.toString()}`;
}

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return null;

  const params = await searchParams;
  const page = Number(params.page ?? "1");
  const limit = 50;
  const offset = (page - 1) * limit;

  const queryParams = new URLSearchParams();
  queryParams.set("limit", String(limit));
  queryParams.set("offset", String(offset));
  if (params.status) queryParams.set("status", params.status);
  if (params.org) queryParams.set("org", params.org);
  if (params.q) queryParams.set("q", params.q);

  const data = await adminFetch<SessionsResponse>(
    `/admin/sessions?${queryParams.toString()}`,
    {},
    token,
  );

  const totalPages = Math.ceil(data.total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
        <span className="text-sm text-muted-foreground">{data.total} total</span>
      </div>

      <Suspense fallback={null}>
        <SessionFilters />
      </Suspense>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>ID</TableHead>
                <TableHead>Org</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Turns</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Resolved</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link
                      href={`/sessions/${s.id}`}
                      className="text-primary hover:underline text-xs font-mono"
                    >
                      {s.id.slice(0, 8)}&hellip;
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs text-foreground">
                    {s.org_name ?? s.org_slug ?? "\u2014"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[s.status] ?? "bg-muted text-muted-foreground border-border"}`}
                    >
                      {s.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.turn_count}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(s.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.resolved_at
                      ? new Date(s.resolved_at).toLocaleString()
                      : "\u2014"}
                  </TableCell>
                </TableRow>
              ))}
              {data.sessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground text-sm text-center py-8">
                    No sessions found matching filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <Link
              href={sessionsHref(params, page - 1)}
              className="text-sm text-muted-foreground hover:text-foreground px-3 py-1 rounded-md bg-secondary hover:bg-secondary/80 transition-colors"
            >
              Previous
            </Link>
          )}
          <span className="text-sm text-muted-foreground px-3 py-1">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={sessionsHref(params, page + 1)}
              className="text-sm text-muted-foreground hover:text-foreground px-3 py-1 rounded-md bg-secondary hover:bg-secondary/80 transition-colors"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
