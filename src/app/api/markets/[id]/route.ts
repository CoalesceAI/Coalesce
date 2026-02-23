import { NextRequest, NextResponse } from "next/server";
import {
  listPolymarketMarkets,
  listKalshiMarkets,
  PredexonApiError,
} from "@/lib/predexon";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Polymarket condition_ids start with "0x", Kalshi tickers are uppercase alpha
    const isPolymarket = id.startsWith("0x");

    if (isPolymarket) {
      const res = await listPolymarketMarkets({ condition_id: [id] });
      const market = res.markets[0];
      if (!market) {
        return NextResponse.json({ error: "Market not found" }, { status: 404 });
      }
      return NextResponse.json({ platform: "polymarket", market });
    }

    const res = await listKalshiMarkets({ ticker: [id] });
    const market = res.markets[0];
    if (!market) {
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }
    return NextResponse.json({ platform: "kalshi", market });
  } catch (err) {
    if (err instanceof PredexonApiError) {
      return NextResponse.json(
        { error: "Upstream API error", detail: err.body },
        { status: err.status },
      );
    }
    console.error("GET /api/markets/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
