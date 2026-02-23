import { NextRequest, NextResponse } from "next/server";
import { getPolymarketTrades, PredexonApiError } from "@/lib/predexon";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conditionId } = await params;
    const sp = req.nextUrl.searchParams;
    const limit = Math.min(Number(sp.get("limit") ?? 50), 500);

    const data = await getPolymarketTrades({
      condition_id: conditionId,
      limit,
      order: "desc",
    });

    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof PredexonApiError) {
      return NextResponse.json(
        { error: "Upstream API error", detail: err.body },
        { status: err.status },
      );
    }
    console.error("GET /api/markets/[id]/trades error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
