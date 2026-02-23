import { NextRequest, NextResponse } from "next/server";
import { getPolymarketCandlesticks, PredexonApiError } from "@/lib/predexon";

const MAX_RANGE_SECONDS: Record<number, number> = {
  1: 7 * 86_400, // 1-min → 7 days
  60: 30 * 86_400, // 1-hour → 30 days
  1440: 365 * 86_400, // 1-day → 365 days
};

const DEFAULT_LOOKBACK: Record<number, number> = {
  1: 86_400, // 1-min → last 24h
  60: 7 * 86_400, // 1-hour → last 7 days
  1440: 90 * 86_400, // 1-day → last 90 days
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conditionId } = await params;
    const sp = req.nextUrl.searchParams;

    const interval = Number(sp.get("interval") ?? 60);
    const nowSec = Math.floor(Date.now() / 1000);

    const lookback = DEFAULT_LOOKBACK[interval] ?? 7 * 86_400;
    const maxRange = MAX_RANGE_SECONDS[interval] ?? 30 * 86_400;

    const endTime = sp.get("end_time") ? Number(sp.get("end_time")) : nowSec;
    let startTime = sp.get("start_time")
      ? Number(sp.get("start_time"))
      : nowSec - lookback;

    if (endTime - startTime > maxRange) {
      startTime = endTime - maxRange;
    }

    const data = await getPolymarketCandlesticks(conditionId, {
      interval,
      start_time: startTime,
      end_time: endTime,
    });

    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof PredexonApiError) {
      return NextResponse.json(
        { error: "Upstream API error", detail: err.body },
        { status: err.status },
      );
    }
    console.error("GET /api/markets/[id]/candlesticks error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
