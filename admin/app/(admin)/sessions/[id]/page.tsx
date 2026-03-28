import { auth } from "@clerk/nextjs/server";
import { adminFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  status: string;
  created_at: string;
  resolved_at: string | null;
  turns: Turn[];
  original_request: {
    endpoint?: string;
    error_code?: string;
    context?: string;
    tried?: string[];
  };
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

  const duration =
    session.resolved_at && session.created_at
      ? Math.round(
          (new Date(session.resolved_at).getTime() -
            new Date(session.created_at).getTime()) /
            1000,
        )
      : null;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/sessions" className="text-zinc-500 hover:text-zinc-300 text-sm">
          &larr; Sessions
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100 font-mono">
            {session.id.slice(0, 12)}&hellip;
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <span
              className={`text-xs px-2 py-0.5 rounded border ${STATUS_COLORS[session.status] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"}`}
            >
              {session.status}
            </span>
            <span className="text-xs text-zinc-500">
              {new Date(session.created_at).toLocaleString()}
            </span>
            {duration !== null && (
              <span className="text-xs text-zinc-500">
                Resolved in {duration < 60 ? `${duration}s` : `${(duration / 60).toFixed(1)}m`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Original request */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-zinc-400 uppercase tracking-wider">
            Original Request
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {session.original_request.endpoint && (
              <div>
                <p className="text-xs text-zinc-500">Endpoint</p>
                <p className="text-zinc-200 font-mono text-xs">
                  {session.original_request.endpoint}
                </p>
              </div>
            )}
            {session.original_request.error_code && (
              <div>
                <p className="text-xs text-zinc-500">Error Code</p>
                <p className="text-zinc-200 font-mono text-xs">
                  {session.original_request.error_code}
                </p>
              </div>
            )}
            {session.original_request.context && (
              <div className="col-span-2">
                <p className="text-xs text-zinc-500">Context</p>
                <p className="text-zinc-300 text-xs mt-1">
                  {session.original_request.context}
                </p>
              </div>
            )}
            {session.original_request.tried &&
              session.original_request.tried.length > 0 && (
                <div className="col-span-2">
                  <p className="text-xs text-zinc-500">Already Tried</p>
                  <ul className="text-zinc-300 text-xs mt-1 list-disc list-inside">
                    {session.original_request.tried.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
          </div>
        </CardContent>
      </Card>

      {/* Conversation timeline */}
      <div className="space-y-3">
        <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
          Conversation ({session.turns.length} turns)
        </h2>
        <div className="space-y-3">
          {session.turns.map((turn, i) => (
            <div
              key={i}
              className={`rounded-lg p-4 ${
                turn.role === "user"
                  ? "bg-zinc-800/50 border border-zinc-800 ml-0 mr-12"
                  : "bg-zinc-900 border border-zinc-700 ml-12 mr-0"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`text-[10px] uppercase font-medium tracking-wider ${
                    turn.role === "user" ? "text-blue-400" : "text-green-400"
                  }`}
                >
                  {turn.role === "user" ? "Agent" : "Coalesce"}
                </span>
              </div>
              <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">
                {typeof turn.content === "string"
                  ? turn.content.slice(0, 5000)
                  : JSON.stringify(turn.content, null, 2).slice(0, 5000)}
              </pre>
            </div>
          ))}
          {session.turns.length === 0 && (
            <p className="text-zinc-500 text-sm text-center py-4">
              No conversation turns recorded.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
