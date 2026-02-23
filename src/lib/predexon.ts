import type {
  PolymarketMarketsResponse,
  KalshiMarketsResponse,
  CandlesticksResponse,
  OrderbooksResponse,
  TradesResponse,
  MatchedPairsResponse,
  PriceResponse,
  VolumeResponse,
  OpenInterestResponse,
} from "@/types/market";

// ---------------------------------------------------------------------------
// Predexon REST API client — server-side only.
// Never import this file from client components.
// ---------------------------------------------------------------------------

const BASE_URL = "https://api.predexon.com/v2";

function getApiKey(): string {
  const key = process.env.PREDEXON_API_KEY;
  if (!key) {
    throw new Error(
      "PREDEXON_API_KEY is not set. Add it to your .env file.",
    );
  }
  return key;
}

class PredexonApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`Predexon API error ${status}`);
    this.name = "PredexonApiError";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function request<T>(path: string, params?: Record<string, any>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const v of value) url.searchParams.append(key, String(v));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const res = await fetch(url.toString(), {
    headers: { "x-api-key": getApiKey() },
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new PredexonApiError(res.status, body);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Polymarket — Markets
// ---------------------------------------------------------------------------

export interface ListPolymarketMarketsParams {
  status?: "open" | "closed";
  search?: string;
  sort?: string;
  limit?: number;
  offset?: number;
  min_volume?: number;
  min_volume_1d?: number;
  tags?: string[];
  condition_id?: string[];
  market_slug?: string[];
}

export function listPolymarketMarkets(
  params?: ListPolymarketMarketsParams,
): Promise<PolymarketMarketsResponse> {
  return request<PolymarketMarketsResponse>("/polymarket/markets", params);
}

// ---------------------------------------------------------------------------
// Kalshi — Markets
// ---------------------------------------------------------------------------

export interface ListKalshiMarketsParams {
  status?: "open" | "closed";
  search?: string;
  sort?: string;
  limit?: number;
  pagination_key?: string;
  min_volume?: number;
  ticker?: string[];
  event_ticker?: string[];
}

export function listKalshiMarkets(
  params?: ListKalshiMarketsParams,
): Promise<KalshiMarketsResponse> {
  return request<KalshiMarketsResponse>("/kalshi/markets", params);
}

// ---------------------------------------------------------------------------
// Price
// ---------------------------------------------------------------------------

export function getPolymarketPrice(
  tokenId: string,
  atTime?: number,
): Promise<PriceResponse> {
  return request<PriceResponse>("/polymarket/price", {
    token_id: tokenId,
    at_time: atTime,
  });
}

// ---------------------------------------------------------------------------
// Candlesticks
// ---------------------------------------------------------------------------

export function getPolymarketCandlesticks(
  conditionId: string,
  opts?: { interval?: number; start_time?: number; end_time?: number },
): Promise<CandlesticksResponse> {
  return request<CandlesticksResponse>(
    `/polymarket/candlesticks/${conditionId}`,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Volume
// ---------------------------------------------------------------------------

export function getPolymarketVolume(
  tokenId: string,
  opts?: {
    granularity?: "day" | "week" | "month" | "year" | "all";
    start_time?: number;
    end_time?: number;
  },
): Promise<VolumeResponse> {
  return request<VolumeResponse>("/polymarket/volume", {
    token_id: tokenId,
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Open Interest
// ---------------------------------------------------------------------------

export function getPolymarketOpenInterest(
  conditionId: string,
  opts?: {
    granularity?: "day" | "week" | "month" | "year" | "all";
    start_time?: number;
    end_time?: number;
  },
): Promise<OpenInterestResponse> {
  return request<OpenInterestResponse>(
    `/polymarket/open-interest/${conditionId}`,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Orderbooks (timestamps in MILLISECONDS)
// ---------------------------------------------------------------------------

export function getPolymarketOrderbooks(
  tokenId: string,
  startTime: number,
  endTime: number,
  opts?: { limit?: number; pagination_key?: string },
): Promise<OrderbooksResponse> {
  return request<OrderbooksResponse>("/polymarket/orderbooks", {
    token_id: tokenId,
    start_time: startTime,
    end_time: endTime,
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Trades
// ---------------------------------------------------------------------------

export interface GetTradesParams {
  market_slug?: string;
  condition_id?: string;
  token_id?: string;
  wallet?: string;
  start_time?: number;
  end_time?: number;
  min_total?: number;
  limit?: number;
  order?: "asc" | "desc";
  pagination_key?: string;
}

export function getPolymarketTrades(
  params: GetTradesParams,
): Promise<TradesResponse> {
  return request<TradesResponse>("/polymarket/trades", params);
}

// ---------------------------------------------------------------------------
// Kalshi Trades
// ---------------------------------------------------------------------------

export interface GetKalshiTradesParams {
  ticker?: string;
  event_ticker?: string;
  start_time?: number;
  end_time?: number;
  limit?: number;
  order?: "asc" | "desc";
  pagination_key?: string;
}

export function getKalshiTrades(
  params: GetKalshiTradesParams,
): Promise<TradesResponse> {
  return request<TradesResponse>("/kalshi/trades", params);
}

// ---------------------------------------------------------------------------
// Matched Pairs (cross-platform) — requires Dev plan
// ---------------------------------------------------------------------------

export interface GetMatchedPairsParams {
  min_similarity?: number;
  active_only?: boolean;
  limit?: number;
  pagination_key?: string;
  sort_by?: "similarity" | "expiration";
  sort_order?: "asc" | "desc";
}

export function getMatchedPairs(
  params?: GetMatchedPairsParams,
): Promise<MatchedPairsResponse> {
  return request<MatchedPairsResponse>("/matching-markets/pairs", params);
}

// ---------------------------------------------------------------------------
// Re-export error class for route handlers
// ---------------------------------------------------------------------------

export { PredexonApiError };
