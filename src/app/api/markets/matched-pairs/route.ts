import { NextRequest, NextResponse } from "next/server";
import {
  getMatchedPairs,
  listPolymarketMarkets,
  listKalshiMarkets,
  PredexonApiError,
} from "@/lib/predexon";
import { matchMarkets, toArbitragePairs } from "@/lib/market-matcher";
import type { ArbitragePair } from "@/types/market";

// ---------------------------------------------------------------------------
// Strategy: try Predexon matched-pairs endpoint first (requires Dev plan).
// On 403, fall back to our local text-similarity matcher.
// ---------------------------------------------------------------------------

async function fetchViaPredexon(
  minSimilarity: number,
  limit: number,
): Promise<{ pairs: ArbitragePair[]; total: number; source: string }> {
  const pairsRes = await getMatchedPairs({
    min_similarity: minSimilarity,
    active_only: true,
    limit,
  });

  if (pairsRes.pairs.length === 0) {
    return { pairs: [], total: 0, source: "predexon" };
  }

  const polyConditionIds = pairsRes.pairs.map((p) => p.POLYMARKET.condition_id);
  const kalshiTickers = pairsRes.pairs.map((p) => p.KALSHI.market_ticker);

  const [polyMarkets, kalshiMarkets] = await Promise.all([
    listPolymarketMarkets({ condition_id: polyConditionIds, limit: 100 }),
    listKalshiMarkets({ ticker: kalshiTickers, limit: 100 }),
  ]);

  const polyMap = new Map(
    polyMarkets.markets.map((m) => [m.condition_id, m]),
  );
  const kalshiMap = new Map(
    kalshiMarkets.markets.map((m) => [m.ticker, m]),
  );

  const pairs: ArbitragePair[] = pairsRes.pairs.map((pair) => {
    const poly = polyMap.get(pair.POLYMARKET.condition_id);
    const kalshi = kalshiMap.get(pair.KALSHI.market_ticker);

    const polyYes = poly?.outcomes.find((o) => o.label === "Yes")?.price ?? null;
    const kalshiYes =
      kalshi?.outcomes.find((o) => o.label === "Yes")?.bid ??
      kalshi?.last_price ??
      null;

    const spread =
      polyYes != null && kalshiYes != null
        ? Math.abs(polyYes - kalshiYes)
        : null;

    return {
      polymarketTitle: pair.POLYMARKET.title,
      kalshiTitle: pair.KALSHI.title,
      polymarketYesPrice: polyYes,
      kalshiYesPrice: kalshiYes,
      spread,
      similarity: pair.similarity,
      polymarketConditionId: pair.POLYMARKET.condition_id,
      polymarketSlug: pair.POLYMARKET.market_slug,
      kalshiTicker: pair.KALSHI.market_ticker,
      expiresAt: pair.earliest_expiration_ts,
    };
  });

  pairs.sort((a, b) => (b.spread ?? 0) - (a.spread ?? 0));

  return {
    pairs,
    total: pairsRes.pagination.count,
    source: "predexon",
  };
}

async function fetchViaLocalMatcher(
  minSimilarity: number,
  limit: number,
): Promise<{ pairs: ArbitragePair[]; total: number; source: string }> {
  const [polyRes, kalshiRes] = await Promise.all([
    listPolymarketMarkets({ status: "open", sort: "volume", limit: 100 }),
    listKalshiMarkets({ status: "open", sort: "volume", limit: 100 }),
  ]);

  const matches = matchMarkets(
    polyRes.markets,
    kalshiRes.markets,
    minSimilarity,
  );

  const allPairs = toArbitragePairs(matches);
  allPairs.sort((a, b) => (b.spread ?? 0) - (a.spread ?? 0));

  return {
    pairs: allPairs.slice(0, limit),
    total: allPairs.length,
    source: "local",
  };
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const minSimilarity = Number(sp.get("min_similarity") ?? 60);
    const limit = Math.min(Number(sp.get("limit") ?? 50), 200);

    let result: { pairs: ArbitragePair[]; total: number; source: string };

    try {
      result = await fetchViaPredexon(minSimilarity, limit);
    } catch (err) {
      if (err instanceof PredexonApiError && err.status === 403) {
        result = await fetchViaLocalMatcher(minSimilarity, limit);
      } else {
        throw err;
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PredexonApiError) {
      return NextResponse.json(
        { error: "Upstream API error", detail: err.body },
        { status: err.status },
      );
    }
    console.error("GET /api/markets/matched-pairs error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
