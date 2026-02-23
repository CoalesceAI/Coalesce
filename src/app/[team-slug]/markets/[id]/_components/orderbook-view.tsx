"use client";

import { useOrderbook } from "@/hooks/use-markets";
import { Skeleton } from "@/components/ui/skeleton";

interface OrderbookViewProps {
  tokenId: string;
}

function formatSize(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

export function OrderbookView({ tokenId }: OrderbookViewProps) {
  const { data, isLoading } = useOrderbook(tokenId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  }

  const snapshot = data?.snapshot;

  if (!snapshot) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No orderbook data available
      </p>
    );
  }

  const asks = [...snapshot.asks].sort((a, b) => a.price - b.price).slice(0, 10);
  const bids = [...snapshot.bids].sort((a, b) => b.price - a.price).slice(0, 10);

  const maxSize = Math.max(
    ...asks.map((l) => l.size),
    ...bids.map((l) => l.size),
    1,
  );

  return (
    <div className="space-y-1 text-xs font-mono">
      <div className="grid grid-cols-2 gap-1 px-1 text-muted-foreground mb-2">
        <span>Price</span>
        <span className="text-right">Size</span>
      </div>

      {/* Asks (sell side) — reversed so lowest ask is near the spread */}
      {[...asks].reverse().map((level, i) => (
        <div key={`ask-${i}`} className="relative grid grid-cols-2 gap-1 px-1 py-0.5">
          <div
            className="absolute inset-y-0 right-0 bg-red-500/10"
            style={{ width: `${(level.size / maxSize) * 100}%` }}
          />
          <span className="relative text-red-600 dark:text-red-400">
            {(level.price * 100).toFixed(1)}¢
          </span>
          <span className="relative text-right">{formatSize(level.size)}</span>
        </div>
      ))}

      <div className="border-t border-b py-1 px-1 text-center text-muted-foreground">
        Spread:{" "}
        {asks[0] && bids[0]
          ? `${((asks[0].price - bids[0].price) * 100).toFixed(1)}¢`
          : "—"}
      </div>

      {/* Bids (buy side) */}
      {bids.map((level, i) => (
        <div key={`bid-${i}`} className="relative grid grid-cols-2 gap-1 px-1 py-0.5">
          <div
            className="absolute inset-y-0 right-0 bg-green-500/10"
            style={{ width: `${(level.size / maxSize) * 100}%` }}
          />
          <span className="relative text-green-600 dark:text-green-400">
            {(level.price * 100).toFixed(1)}¢
          </span>
          <span className="relative text-right">{formatSize(level.size)}</span>
        </div>
      ))}
    </div>
  );
}
