"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useMarket, useCandlesticks, useTrades } from "@/hooks/use-markets";
import PageContainer from "@/components/layouts/page-container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { PriceChart } from "@/app/[team-slug]/markets/[id]/_components/price-chart";
import { TradesTable } from "@/app/[team-slug]/markets/[id]/_components/trades-table";
import { OrderbookView } from "@/app/[team-slug]/markets/[id]/_components/orderbook-view";
import type { PolymarketMarket, KalshiMarket } from "@/types/market";

function formatUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export default function MarketDetailView() {
  const params = useParams();
  const teamSlug = params["team-slug"] as string;
  const marketId = params.id as string;

  const { data, isLoading } = useMarket(marketId);
  const { data: candles } = useCandlesticks(
    data?.platform === "polymarket" ? marketId : undefined,
    60,
  );
  const { data: trades } = useTrades(
    data?.platform === "polymarket" ? marketId : undefined,
  );

  if (isLoading) {
    return (
      <PageContainer scrollable>
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-[400px] w-full" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </div>
      </PageContainer>
    );
  }

  if (!data) {
    return (
      <PageContainer scrollable>
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-lg font-medium">Market not found</p>
          <Link href={`/${teamSlug}/markets`}>
            <Button variant="ghost" className="mt-2">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Markets
            </Button>
          </Link>
        </div>
      </PageContainer>
    );
  }

  const isPoly = data.platform === "polymarket";
  const market = data.market;

  const title = market.title;
  const status = market.status;

  let yesPrice: number | null = null;
  let noPrice: number | null = null;
  let totalVolume = 0;
  let liquidity = 0;
  let yesTokenId: string | null = null;

  if (isPoly) {
    const m = market as PolymarketMarket;
    const yesOutcome = m.outcomes.find((o) => o.label === "Yes");
    const noOutcome = m.outcomes.find((o) => o.label === "No");
    yesPrice = yesOutcome?.price ?? m.outcomes[0]?.price ?? null;
    noPrice = noOutcome?.price ?? m.outcomes[1]?.price ?? null;
    yesTokenId = yesOutcome?.token_id ?? m.outcomes[0]?.token_id ?? null;
    totalVolume = m.total_volume_usd;
    liquidity = m.liquidity_usd;
  } else {
    const m = market as KalshiMarket;
    const yesOutcome = m.outcomes.find((o) => o.label === "Yes");
    yesPrice = yesOutcome?.bid ?? m.last_price ?? null;
    noPrice = yesPrice != null ? 1 - yesPrice : null;
    totalVolume = m.dollar_volume;
    liquidity = m.dollar_open_interest;
  }

  return (
    <PageContainer scrollable>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Link href={`/${teamSlug}/markets`}>
            <Button variant="ghost" size="sm" className="mb-2 -ml-2">
              <ArrowLeft className="mr-1 h-4 w-4" /> Markets
            </Button>
          </Link>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
              <div className="flex items-center gap-2">
                <Badge
                  variant={isPoly ? "default" : "secondary"}
                  className="text-[10px] uppercase"
                >
                  {isPoly ? "Polymarket" : "Kalshi"}
                </Badge>
                <Badge variant={status === "open" ? "outline" : "destructive"}>
                  {status}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Yes Price
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {yesPrice != null ? `${(yesPrice * 100).toFixed(1)}¢` : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                No Price
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {noPrice != null ? `${(noPrice * 100).toFixed(1)}¢` : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Volume
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatUsd(totalVolume)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {isPoly ? "Liquidity" : "Open Interest"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatUsd(liquidity)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Chart */}
        {isPoly && (
          <Card>
            <CardHeader>
              <CardTitle>Price History (1h candles)</CardTitle>
            </CardHeader>
            <CardContent>
              <PriceChart candlesticks={candles?.candlesticks ?? []} />
            </CardContent>
          </Card>
        )}

        {/* Orderbook + Trades */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {isPoly && yesTokenId && (
            <Card>
              <CardHeader>
                <CardTitle>Orderbook</CardTitle>
              </CardHeader>
              <CardContent>
                <OrderbookView tokenId={yesTokenId} />
              </CardContent>
            </Card>
          )}

          {isPoly && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Trades</CardTitle>
              </CardHeader>
              <CardContent>
                <TradesTable trades={trades?.trades ?? []} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
