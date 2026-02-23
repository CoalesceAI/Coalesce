import { NextRequest, NextResponse } from "next/server";
import {
  listPolymarketMarkets,
  listKalshiMarkets,
  PredexonApiError,
} from "@/lib/predexon";
import type { UnifiedMarket } from "@/types/market";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const search = sp.get("search") ?? undefined;
    const platform = sp.get("platform"); // "polymarket" | "kalshi" | null (both)
    const sort = sp.get("sort") ?? "volume";
    const status = (sp.get("status") as "open" | "closed") ?? "open";
    const limit = Math.min(Number(sp.get("limit") ?? 20), 100);
    const offset = Number(sp.get("offset") ?? 0);

    const markets: UnifiedMarket[] = [];

    const shouldFetchPoly = !platform || platform === "polymarket";
    const shouldFetchKalshi = !platform || platform === "kalshi";

    const [polyRes, kalshiRes] = await Promise.all([
      shouldFetchPoly
        ? listPolymarketMarkets({
            search,
            sort,
            status,
            limit,
            offset,
          })
        : null,
      shouldFetchKalshi
        ? listKalshiMarkets({
            search,
            sort: sort === "volume" ? "volume" : sort === "open_interest" ? "open_interest" : "volume",
            status,
            limit,
          })
        : null,
    ]);

    if (polyRes) {
      for (const m of polyRes.markets) {
        const yesOutcome = m.outcomes.find((o) => o.label === "Yes");
        const noOutcome = m.outcomes.find((o) => o.label === "No");
        markets.push({
          id: m.condition_id,
          platform: "polymarket",
          title: m.title,
          status: m.status,
          yesPrice: yesOutcome?.price ?? m.outcomes[0]?.price ?? null,
          noPrice: noOutcome?.price ?? m.outcomes[1]?.price ?? null,
          volume: m.total_volume_usd,
          liquidity: m.liquidity_usd,
          volume24h: m.rolling_metrics?.volume_1d ?? 0,
          trades24h: m.rolling_metrics?.trades_1d ?? 0,
          imageUrl: m.image_url,
          tags: m.tags,
          endTime: m.end_time,
          createdTime: m.created_time,
          slug: m.market_slug,
          conditionId: m.condition_id,
        });
      }
    }

    if (kalshiRes) {
      for (const m of kalshiRes.markets) {
        const yesOutcome = m.outcomes.find((o) => o.label === "Yes");
        const noOutcome = m.outcomes.find((o) => o.label === "No");
        markets.push({
          id: m.ticker,
          platform: "kalshi",
          title: m.title,
          status: m.status,
          yesPrice: yesOutcome?.bid ?? m.last_price ?? null,
          noPrice: noOutcome?.bid ?? (m.last_price != null ? 1 - m.last_price : null),
          volume: m.dollar_volume,
          liquidity: m.dollar_open_interest,
          volume24h: 0,
          trades24h: 0,
          imageUrl: "",
          tags: [],
          endTime: m.close_time,
          createdTime: m.created_at,
          slug: m.ticker,
          ticker: m.ticker,
          eventTicker: m.event_ticker,
        });
      }
    }

    markets.sort((a, b) => b.volume - a.volume);

    return NextResponse.json({
      markets,
      total: (polyRes?.pagination.total ?? 0) + (kalshiRes?.pagination.count ?? 0),
    });
  } catch (err) {
    if (err instanceof PredexonApiError) {
      return NextResponse.json(
        { error: "Upstream API error", detail: err.body },
        { status: err.status },
      );
    }
    console.error("GET /api/markets error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
