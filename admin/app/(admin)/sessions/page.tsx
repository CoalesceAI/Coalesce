import { auth } from "@clerk/nextjs/server";
import { adminFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";

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

const STATUS_COLORS: Record<string, string> = {
  resolved: "bg-green-500/20 text-green-400 border-green-500/30",
  needs_info: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  unknown: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  active: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return null;

  const { page } = await searchParams;
  const currentPage = Math.max(1, Number(page ?? "1"));
  const limit = 50;
  const offset = (currentPage - 1) * limit;

  const data = await adminFetch<{ sessions: Session[]; total: number }>(
    `/admin/sessions?limit=${limit}&offset=${offset}`,
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

      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Session ID</TableHead>
                <TableHead className="text-zinc-400">Org</TableHead>
                <TableHead className="text-zinc-400">Customer</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-zinc-400">Turns</TableHead>
                <TableHead className="text-zinc-400">Created</TableHead>
                <TableHead className="text-zinc-400">Resolved</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sessions.map((s) => (
                <TableRow
                  key={s.id}
                  className="border-zinc-800 hover:bg-zinc-800/50"
                >
                  <TableCell>
                    <Link
                      href={`/sessions/${s.id}`}
                      className="font-mono text-xs text-blue-400 hover:underline"
                    >
                      {s.id.slice(0, 8)}…
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs text-zinc-400">
                    {s.org_name ?? s.org_id?.slice(0, 8) ?? "\u2014"}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-400">
                    {s.external_customer_id ?? "—"}
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
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          {currentPage > 1 && (
            <Link
              href={`/sessions?page=${currentPage - 1}`}
              className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
            >
              Previous
            </Link>
          )}
          <span>
            Page {currentPage} of {totalPages}
          </span>
          {currentPage < totalPages && (
            <Link
              href={`/sessions?page=${currentPage + 1}`}
              className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
