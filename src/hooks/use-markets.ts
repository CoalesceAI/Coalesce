"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/utils";
import type {
  UnifiedMarket,
  CandlesticksResponse,
  TradesResponse,
  OrderbookSnapshot,
  ArbitragePair,
  PolymarketMarket,
  KalshiMarket,
} from "@/types/market";

// ---------------------------------------------------------------------------
// Markets list
// ---------------------------------------------------------------------------

interface UseMarketsParams {
  search?: string;
  platform?: "polymarket" | "kalshi";
  sort?: string;
  status?: "open" | "closed";
  limit?: number;
  offset?: number;
}

interface MarketsListResponse {
  markets: UnifiedMarket[];
  total: number;
}

export function useMarkets(params?: UseMarketsParams) {
  const sp = new URLSearchParams();
  if (params?.search) sp.set("search", params.search);
  if (params?.platform) sp.set("platform", params.platform);
  if (params?.sort) sp.set("sort", params.sort);
  if (params?.status) sp.set("status", params.status);
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.offset) sp.set("offset", String(params.offset));

  const query = sp.toString();
  const key = `/api/markets${query ? `?${query}` : ""}`;

  return useSWR<MarketsListResponse>(key, fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: false,
  });
}

// ---------------------------------------------------------------------------
// Single market detail
// ---------------------------------------------------------------------------

type MarketDetailResponse =
  | { platform: "polymarket"; market: PolymarketMarket }
  | { platform: "kalshi"; market: KalshiMarket };

export function useMarket(id: string | undefined) {
  return useSWR<MarketDetailResponse>(
    id ? `/api/markets/${id}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
}

// ---------------------------------------------------------------------------
// Candlesticks
// ---------------------------------------------------------------------------

export function useCandlesticks(
  conditionId: string | undefined,
  interval: number = 60,
) {
  const key = conditionId
    ? `/api/markets/${conditionId}/candlesticks?interval=${interval}`
    : null;

  return useSWR<CandlesticksResponse>(key, fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  });
}

// ---------------------------------------------------------------------------
// Orderbook
// ---------------------------------------------------------------------------

interface OrderbookResponse {
  snapshot: OrderbookSnapshot | null;
}

export function useOrderbook(tokenId: string | undefined) {
  return useSWR<OrderbookResponse>(
    tokenId ? `/api/markets/${tokenId}/orderbook` : null,
    fetcher,
    {
      refreshInterval: 15_000,
      revalidateOnFocus: false,
    },
  );
}

// ---------------------------------------------------------------------------
// Trades
// ---------------------------------------------------------------------------

export function useTrades(conditionId: string | undefined, limit = 50) {
  const key = conditionId
    ? `/api/markets/${conditionId}/trades?limit=${limit}`
    : null;

  return useSWR<TradesResponse>(key, fetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: false,
  });
}

// ---------------------------------------------------------------------------
// Matched pairs / Arbitrage
// ---------------------------------------------------------------------------

interface MatchedPairsListResponse {
  pairs: ArbitragePair[];
  total: number;
  source: "predexon" | "local";
}

export function useMatchedPairs(minSimilarity = 60) {
  return useSWR<MatchedPairsListResponse>(
    `/api/markets/matched-pairs?min_similarity=${minSimilarity}`,
    fetcher,
    {
      refreshInterval: 60_000,
      revalidateOnFocus: false,
    },
  );
}
