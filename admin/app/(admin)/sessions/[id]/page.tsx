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

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  resolved: "default",
  needs_info: "outline",
  unknown: "secondary",
  active: "outline",
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
        <Link href="/sessions" className="text-muted-foreground hover:text-foreground text-sm">
          &larr; Sessions
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground font-mono">
            {session.id.slice(0, 12)}&hellip;
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <Badge variant={STATUS_VARIANT[session.status] ?? "secondary"}>
              {session.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(session.created_at).toLocaleString()}
            </span>
            {duration !== null && (
              <span className="text-xs text-muted-foreground">
                Resolved in {duration < 60 ? `${duration}s` : `${(duration / 60).toFixed(1)}m`}
              </span>
            )}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">
            Original Request
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {session.original_request.endpoint && (
              <div>
                <p className="text-xs text-muted-foreground">Endpoint</p>
                <p className="text-foreground/80 font-mono text-xs">
                  {session.original_request.endpoint}
                </p>
              </div>
            )}
            {session.original_request.error_code && (
              <div>
                <p className="text-xs text-muted-foreground">Error Code</p>
                <p className="text-foreground/80 font-mono text-xs">
                  {session.original_request.error_code}
                </p>
              </div>
            )}
            {session.original_request.context && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Context</p>
                <p className="text-foreground/70 text-xs mt-1">
                  {session.original_request.context}
                </p>
              </div>
            )}
            {session.original_request.tried &&
              session.original_request.tried.length > 0 && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Already Tried</p>
                  <ul className="text-foreground/70 text-xs mt-1 list-disc list-inside">
                    {session.original_request.tried.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Conversation ({session.turns.length} turns)
        </h2>
        <div className="space-y-3">
          {session.turns.map((turn, i) => (
            <div
              key={i}
              className={`rounded-lg p-4 border ${
                turn.role === "user"
                  ? "bg-muted/50 border-border ml-0 mr-12"
                  : "bg-card border-border ml-12 mr-0"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`text-[10px] uppercase font-medium tracking-wider ${
                    turn.role === "user" ? "text-blue-400" : "text-green-400"
                  }`}
                >
                  {turn.role === "user" ? "Agent" : "Apoyo"}
                </span>
              </div>
              <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono leading-relaxed">
                {typeof turn.content === "string"
                  ? turn.content.slice(0, 5000)
                  : JSON.stringify(turn.content, null, 2).slice(0, 5000)}
              </pre>
            </div>
          ))}
          {session.turns.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-4">
              No conversation turns recorded.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
