"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { UnifiedMarket } from "@/types/market";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function formatPrice(p: number | null): string {
  if (p == null) return "—";
  return `${(p * 100).toFixed(1)}¢`;
}

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <Badge
      variant={platform === "polymarket" ? "default" : "secondary"}
      className="text-[10px] uppercase tracking-wider"
    >
      {platform === "polymarket" ? "Poly" : "Kalshi"}
    </Badge>
  );
}

interface MarketTableProps {
  markets: UnifiedMarket[];
  isLoading: boolean;
  total: number;
}

export function MarketTable({ markets, isLoading, total }: MarketTableProps) {
  const params = useParams();
  const teamSlug = params["team-slug"] as string;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (markets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-lg font-medium">No markets found</p>
        <p className="text-sm text-muted-foreground">
          Try adjusting your search or filters
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[300px]">Market</TableHead>
            <TableHead>Platform</TableHead>
            <TableHead className="text-right">Yes</TableHead>
            <TableHead className="text-right">No</TableHead>
            <TableHead className="text-right">Volume</TableHead>
            <TableHead className="text-right">24h Vol</TableHead>
            <TableHead className="text-right">Liquidity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {markets.map((m) => (
            <TableRow key={`${m.platform}-${m.id}`} className="cursor-pointer">
              <TableCell>
                <Link
                  href={`/${teamSlug}/markets/${m.id}`}
                  className="block font-medium hover:underline"
                >
                  {m.title}
                </Link>
              </TableCell>
              <TableCell>
                <PlatformBadge platform={m.platform} />
              </TableCell>
              <TableCell className="text-right font-mono text-green-600 dark:text-green-400">
                {formatPrice(m.yesPrice)}
              </TableCell>
              <TableCell className="text-right font-mono text-red-600 dark:text-red-400">
                {formatPrice(m.noPrice)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatUsd(m.volume)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {m.volume24h > 0 ? formatUsd(m.volume24h) : "—"}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatUsd(m.liquidity)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">
        Showing {markets.length} of {total} markets
      </p>
    </div>
  );
}
