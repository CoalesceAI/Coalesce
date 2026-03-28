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
import { TimelineChart } from "@/components/charts/timeline-chart";
import { OutcomeChart } from "@/components/charts/outcome-chart";
import { RefreshButton } from "@/components/refresh-button";

interface Stats {
  total: number;
  resolved: number;
  needs_info: number;
  unknown: number;
  active: number;
  avg_resolution_ms: number | null;
  last_24h_count: number;
  last_7d_count: number;
}

interface TimelinePoint {
  day: string;
  total: number;
  resolved: number;
  needs_info: number;
  unknown: number;
}

interface OrgStat {
  org_id: string;
  org_name: string;
  org_slug: string;
  total: number;
  resolved: number;
  avg_resolution_ms: number | null;
}

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

function formatMs(ms: number | null): string {
  if (ms === null) return "\u2014";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

const STATUS_COLORS: Record<string, string> = {
  resolved: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/25",
  needs_info: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  unknown: "bg-stone-500/15 text-stone-600 dark:text-stone-400 border-stone-500/25",
  active: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25",
};

export default async function DashboardPage() {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return null;

  const [stats, timeline, orgStats, sessionsData] = await Promise.all([
    adminFetch<Stats>("/admin/stats", {}, token),
    adminFetch<TimelinePoint[]>("/admin/stats/timeline?days=30", {}, token),
    adminFetch<OrgStat[]>("/admin/stats/by-org", {}, token),
    adminFetch<{ sessions: Session[]; total: number }>(
      "/admin/sessions?limit=10&offset=0",
      {},
      token,
    ),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <RefreshButton />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Total Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.last_24h_count} last 24h &middot; {stats.last_7d_count} last 7d
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Resolution Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">
              {pct(stats.resolved, stats.total)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.resolved} of {stats.total} resolved
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Avg Resolution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {formatMs(stats.avg_resolution_ms)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">for resolved sessions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Active Now
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">{stats.active}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.needs_info} awaiting info
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Request Volume (30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TimelineChart data={timeline} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Outcome Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OutcomeChart data={stats} />
            <div className="flex flex-wrap gap-4 mt-4 justify-center">
              {[
                { label: "Resolved", value: stats.resolved, color: "bg-green-500" },
                { label: "Needs Info", value: stats.needs_info, color: "bg-amber-500" },
                { label: "Unknown", value: stats.unknown, color: "bg-stone-400" },
                { label: "Active", value: stats.active, color: "bg-blue-500" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
                  <span className="text-xs text-muted-foreground">
                    {label}: <span className="text-foreground font-medium">{value}</span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-org breakdown */}
      {orgStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">By Organization</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Organization</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Resolved</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Avg Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgStats.map((org) => (
                  <TableRow key={org.org_id}>
                    <TableCell>
                      <Link
                        href={`/settings/${org.org_slug}`}
                        className="text-sm text-primary hover:underline font-medium"
                      >
                        {org.org_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-right">{org.total}</TableCell>
                    <TableCell className="text-sm text-green-600 dark:text-green-400 text-right">
                      {org.resolved}
                    </TableCell>
                    <TableCell className="text-sm text-right">
                      {pct(org.resolved, org.total)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground text-right">
                      {formatMs(org.avg_resolution_ms)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recent sessions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Recent Sessions</CardTitle>
          <Link href="/sessions" className="text-xs text-primary hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Session</TableHead>
                <TableHead>Org</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Turns</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessionsData.sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link
                      href={`/sessions/${s.id}`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {s.id.slice(0, 8)}&hellip;
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.org_name ?? s.org_id?.slice(0, 8) ?? "\u2014"}
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
                </TableRow>
              ))}
              {sessionsData.sessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-8">
                    No sessions yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
