"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import PageContainer from "@/components/layouts/page-container";
import { useMarkets, useMatchedPairs } from "@/hooks/use-markets";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, ArrowLeftRight, TrendingUp, Activity } from "lucide-react";

function formatUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  loading,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

export default function OverViewPage() {
  const params = useParams();
  const teamSlug = params["team-slug"] as string;

  const { data: marketsData, isLoading: marketsLoading } = useMarkets({
    status: "open",
    sort: "volume",
    limit: 10,
  });

  const { data: arbData, isLoading: arbLoading } = useMatchedPairs(95);

  const totalVolume =
    marketsData?.markets.reduce((sum, m) => sum + m.volume, 0) ?? 0;
  const totalVolume24h =
    marketsData?.markets.reduce((sum, m) => sum + m.volume24h, 0) ?? 0;
  // Instead of hardcoding the first pair, dynamically find the maximum spread across all pairs
  const topSpread =
    arbData?.pairs && arbData.pairs.length > 0
      ? Math.max(...arbData.pairs.map((pair) => pair.spread ?? 0))
      : 0;

  return (
    <PageContainer scrollable>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Prediction market intelligence at a glance
          </p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Markets Tracked"
            value={String(marketsData?.total ?? 0)}
            subtitle="Active across Polymarket & Kalshi"
            icon={BarChart3}
            loading={marketsLoading}
          />
          <StatCard
            title="Matched Pairs"
            value={String(arbData?.total ?? 0)}
            subtitle="Cross-platform matches"
            icon={ArrowLeftRight}
            loading={arbLoading}
          />
          <StatCard
            title="Top Spread"
            value={topSpread > 0 ? `${(topSpread * 100).toFixed(1)}¢` : "—"}
            subtitle="Largest price discrepancy"
            icon={TrendingUp}
            loading={arbLoading}
          />
          <StatCard
            title="24h Volume"
            value={totalVolume24h > 0 ? formatUsd(totalVolume24h) : "—"}
            subtitle="Across top markets"
            icon={Activity}
            loading={marketsLoading}
          />
        </div>

        {/* Hot Markets */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Hot Markets</CardTitle>
              <CardDescription>Top markets by total volume</CardDescription>
            </CardHeader>
            <CardContent>
              {marketsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {(marketsData?.markets ?? []).slice(0, 8).map((m) => (
                    <Link
                      key={`${m.platform}-${m.id}`}
                      href={`/${teamSlug}/markets/${m.id}`}
                      className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge
                          variant={
                            m.platform === "polymarket"
                              ? "default"
                              : "secondary"
                          }
                          className="text-[9px] uppercase shrink-0"
                        >
                          {m.platform === "polymarket" ? "PM" : "KL"}
                        </Badge>
                        <span className="text-sm font-medium truncate">
                          {m.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-2">
                        <span className="text-sm font-mono text-green-600 dark:text-green-400">
                          {m.yesPrice != null
                            ? `${(m.yesPrice * 100).toFixed(0)}¢`
                            : "—"}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono w-16 text-right">
                          {formatUsd(m.volume)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Arbitrage Opportunities</CardTitle>
              <CardDescription>
                Largest price discrepancies across platforms
              </CardDescription>
            </CardHeader>
            <CardContent>
              {arbLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (arbData?.pairs ?? []).length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground text-center">
                  Requires Dev plan API key
                </p>
              ) : (
                <div className="space-y-3">
                  {(arbData?.pairs ?? []).slice(0, 8).map((p) => (
                    <Link
                      key={`${p.polymarketConditionId}-${p.kalshiTicker}`}
                      href={`/${teamSlug}/markets/${p.polymarketConditionId}`}
                      className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-sm font-medium truncate min-w-0">
                        {p.polymarketTitle}
                      </span>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-xs font-mono text-muted-foreground">
                          PM{" "}
                          {p.polymarketYesPrice != null
                            ? `${(p.polymarketYesPrice * 100).toFixed(0)}¢`
                            : "—"}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground">
                          KL{" "}
                          {p.kalshiYesPrice != null
                            ? `${(p.kalshiYesPrice * 100).toFixed(0)}¢`
                            : "—"}
                        </span>
                        <Badge
                          variant={
                            (p.spread ?? 0) >= 0.05 ? "default" : "secondary"
                          }
                          className="font-mono text-[10px]"
                        >
                          {p.spread != null
                            ? `${(p.spread * 100).toFixed(1)}¢`
                            : "—"}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
