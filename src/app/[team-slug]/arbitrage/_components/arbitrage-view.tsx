"use client";

import { useMatchedPairs } from "@/hooks/use-markets";
import PageContainer from "@/components/layouts/page-container";
import { ArbitrageTable } from "@/app/[team-slug]/arbitrage/_components/arbitrage-table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function ArbitrageView() {
  const { data, isLoading, error } = useMatchedPairs(60);

  return (
    <PageContainer scrollable>
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Arbitrage Scanner
            </h2>
            <p className="text-muted-foreground">
              Cross-platform price discrepancies between Polymarket and Kalshi.
              Pairs sorted by spread size.
            </p>
          </div>
          {data?.source && (
            <Badge variant="outline" className="shrink-0">
              {data.source === "predexon" ? "Predexon" : "Local matcher"}
            </Badge>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load arbitrage pairs. Please try again later.
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <ArbitrageTable pairs={data?.pairs ?? []} total={data?.total ?? 0} />
        )}
      </div>
    </PageContainer>
  );
}
