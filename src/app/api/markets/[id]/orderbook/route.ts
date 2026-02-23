import { NextRequest, NextResponse } from "next/server";
import { getPolymarketOrderbooks, PredexonApiError } from "@/lib/predexon";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: tokenId } = await params;
    const sp = req.nextUrl.searchParams;

    const now = Date.now();
    const startTime = Number(sp.get("start_time") ?? now - 5 * 60 * 1000); // default last 5 min
    const endTime = Number(sp.get("end_time") ?? now);

    const data = await getPolymarketOrderbooks(tokenId, startTime, endTime, {
      limit: 1,
    });

    const latest = data.snapshots[data.snapshots.length - 1] ?? null;

    return NextResponse.json({ snapshot: latest });
  } catch (err) {
    if (err instanceof PredexonApiError) {
      return NextResponse.json(
        { error: "Upstream API error", detail: err.body },
        { status: err.status },
      );
    }
    console.error("GET /api/markets/[id]/orderbook error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
