import { auth } from "@clerk/nextjs/server";
import { adminFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { notFound } from "next/navigation";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

interface SessionDetail {
  id: string;
  org_id: string | null;
  external_customer_id: string | null;
  turns: Turn[];
  original_request: Record<string, unknown>;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  resolved: "bg-green-500/20 text-green-400 border-green-500/30",
  needs_info: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  unknown: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  active: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return null;

  const { id } = await params;

  let session: SessionDetail;
  try {
    session = await adminFetch<SessionDetail>(`/admin/sessions/${id}`, {}, token);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/sessions" className="text-zinc-500 hover:text-zinc-300 text-sm">
          ← Sessions
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-mono text-lg text-zinc-100">{session.id}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Org: {session.org_id ?? "—"} · Customer: {session.external_customer_id ?? "—"}
          </p>
        </div>
        <span
          className={`text-xs px-2 py-1 rounded border ${STATUS_COLORS[session.status] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"}`}
        >
          {session.status}
        </span>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Original Request</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs text-zinc-400 overflow-auto bg-zinc-950 p-3 rounded">
            {JSON.stringify(session.original_request, null, 2)}
          </pre>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">
            Conversation ({session.turns.length} turns)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {session.turns.map((turn, i) => (
            <div
              key={i}
              className={`p-3 rounded text-sm ${
                turn.role === "user"
                  ? "bg-zinc-800 text-zinc-300"
                  : "bg-zinc-800/50 border border-zinc-700 text-zinc-400"
              }`}
            >
              <p className="text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wider">
                {turn.role}
              </p>
              <p className="whitespace-pre-wrap">{turn.content}</p>
            </div>
          ))}
          {session.turns.length === 0 && (
            <p className="text-sm text-zinc-500">No turns recorded.</p>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-zinc-600 space-x-4">
        <span>Created: {new Date(session.created_at).toLocaleString()}</span>
        {session.resolved_at && (
          <span>Resolved: {new Date(session.resolved_at).toLocaleString()}</span>
        )}
      </div>
    </div>
  );
}
