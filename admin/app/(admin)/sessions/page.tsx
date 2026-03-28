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
  resolved: "bg-green-500/20 text-green-400 border-green-500/30",
  needs_info: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  unknown: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  active: "bg-blue-500/20 text-blue-400 border-blue-500/30",
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
        <h1 className="text-2xl font-semibold text-zinc-100">Sessions</h1>
        <span className="text-sm text-zinc-500">{data.total} total</span>
      </div>

      <Suspense fallback={null}>
        <SessionFilters />
      </Suspense>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">ID</TableHead>
                <TableHead className="text-zinc-400">Org</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-zinc-400">Turns</TableHead>
                <TableHead className="text-zinc-400">Created</TableHead>
                <TableHead className="text-zinc-400">Resolved</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sessions.map((s) => (
                <TableRow key={s.id} className="border-zinc-800 hover:bg-zinc-800/50">
                  <TableCell>
                    <Link
                      href={`/sessions/${s.id}`}
                      className="text-blue-400 hover:underline text-xs font-mono"
                    >
                      {s.id.slice(0, 8)}&hellip;
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs text-zinc-300">
                    {s.org_name ?? s.org_slug ?? "\u2014"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`text-xs px-2 py-0.5 rounded border ${STATUS_COLORS[s.status] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"}`}
                    >
                      {s.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-zinc-400">
                    {s.turn_count}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500">
                    {new Date(s.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500">
                    {s.resolved_at
                      ? new Date(s.resolved_at).toLocaleString()
                      : "\u2014"}
                  </TableCell>
                </TableRow>
              ))}
              {data.sessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-zinc-500 text-sm text-center py-8">
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
              className="text-sm text-zinc-400 hover:text-zinc-100 px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
            >
              Previous
            </Link>
          )}
          <span className="text-sm text-zinc-500 px-3 py-1">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={sessionsHref(params, page + 1)}
              className="text-sm text-zinc-400 hover:text-zinc-100 px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
