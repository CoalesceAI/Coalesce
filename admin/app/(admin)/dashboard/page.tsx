"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { useOrg } from "@/lib/org-context";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getCoalesceApiBase } from "@/lib/api-base";

interface Stats {
  total: number;
  resolved: number;
  needs_info: number;
  unknown: number;
  active: number;
  avg_resolution_ms: number | null;
}

interface TimelinePoint {
  day: string;
  total: number;
  resolved: number;
  needs_info: number;
  unknown: number;
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

export default function DashboardPage() {
  const { getToken } = useAuth();
  const { currentOrg, loading: orgLoading, error: orgError, refreshOrgs } = useOrg();
  const [stats, setStats] = useState<Stats | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const token = await getToken();
      const base = getCoalesceApiBase();
      const headers = { Authorization: `Bearer ${token}` };
      const slug = currentOrg.slug;

      const [statsRes, timelineRes, sessionsRes] = await Promise.all([
        fetch(`${base}/admin/orgs/${slug}/stats`, { headers }),
        fetch(`${base}/admin/stats/timeline?days=30`, { headers }),
        fetch(`${base}/admin/sessions?org=${slug}&limit=10&offset=0`, { headers }),
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (timelineRes.ok) setTimeline(await timelineRes.json());
      if (sessionsRes.ok) {
        const data = await sessionsRes.json();
        setSessions(data.sessions);
        setSessionsTotal(data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [getToken, currentOrg]);

  useEffect(() => {
    if (currentOrg) fetchData();
  }, [currentOrg, fetchData]);

  if (orgLoading || (loading && currentOrg)) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (orgError) {
    return (
      <div className="space-y-6 max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <Alert variant="destructive">
          <AlertTitle>Could not load organizations</AlertTitle>
          <AlertDescription className="mt-1 whitespace-pre-wrap">
            {orgError}
          </AlertDescription>
        </Alert>
        <Button type="button" variant="secondary" size="sm" onClick={() => refreshOrgs()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!currentOrg) {
    return (
      <div className="space-y-4 max-w-lg">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          You are not a member of any organization yet. Create one in{" "}
          <Link href="/settings" className="text-primary hover:underline">
            Settings
          </Link>
          , or ask an admin to invite you. If you use seed data, set{" "}
          <code className="text-xs font-mono bg-muted px-1 rounded">SEED_CLERK_USER_ID</code>{" "}
          to your Clerk user id and run{" "}
          <code className="text-xs font-mono bg-muted px-1 rounded">npm run seed</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <RefreshButton />
      </div>

      {stats && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Total Requests
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{stats.total}</p>
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
                <p className="text-xs text-muted-foreground mt-1">
                  for resolved sessions
                </p>
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
        </>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Recent Sessions</CardTitle>
          <Link href="/sessions" className="text-xs text-primary hover:underline">
            View all ({sessionsTotal})
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Session</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Turns</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link
                      href={`/sessions/${s.id}`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {s.id.slice(0, 8)}&hellip;
                    </Link>
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
              {sessions.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-muted-foreground text-sm py-8"
                  >
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
