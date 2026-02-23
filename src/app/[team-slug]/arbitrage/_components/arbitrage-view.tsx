"use client";

import { useState } from "react";
import { useMatchedPairs } from "@/hooks/use-markets";
import PageContainer from "@/components/layouts/page-container";
import { ArbitrageTable } from "@/app/[team-slug]/arbitrage/_components/arbitrage-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownUp } from "lucide-react";

type SortMode = "similarity" | "spread";

export default function ArbitrageView() {
  const [sort, setSort] = useState<SortMode>("similarity");
  const { data, isLoading, error } = useMatchedPairs(60, sort);

  return (
    <PageContainer scrollable>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Arbitrage Scanner
            </h2>
            <p className="text-muted-foreground">
              Cross-platform price discrepancies between Polymarket and Kalshi.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {data?.source && (
              <Badge variant="outline">
                {data.source === "predexon"
                  ? "Predexon API"
                  : data.source === "openai"
                    ? "OpenAI embeddings"
                    : "Text heuristics"}
              </Badge>
            )}
          </div>
        </div>

        {/* Sort controls */}
        <div className="flex items-center gap-2">
          <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Sort by:</span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={sort === "similarity" ? "default" : "outline"}
              onClick={() => setSort("similarity")}
              className="h-7 text-xs"
            >
              Match confidence
            </Button>
            <Button
              size="sm"
              variant={sort === "spread" ? "default" : "outline"}
              onClick={() => setSort("spread")}
              className="h-7 text-xs"
            >
              Spread size
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load arbitrage pairs. Please try again later.
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <ArbitrageTable pairs={data?.pairs ?? []} total={data?.total ?? 0} />
        )}
      </div>
    </PageContainer>
  );
}
