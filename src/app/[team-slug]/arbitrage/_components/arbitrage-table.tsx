"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import type { ArbitragePair } from "@/types/market";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatPrice(p: number | null): string {
  if (p == null) return "—";
  return `${(p * 100).toFixed(1)}¢`;
}

function spreadColor(spread: number | null): string {
  if (spread == null) return "";
  if (spread >= 0.05) return "text-green-600 dark:text-green-400 font-bold";
  if (spread >= 0.03) return "text-yellow-600 dark:text-yellow-400 font-semibold";
  return "text-muted-foreground";
}

function similarityVariant(score: number | null): "default" | "secondary" | "outline" {
  if (score == null) return "outline";
  if (score >= 90) return "default";
  if (score >= 75) return "secondary";
  return "outline";
}

interface ArbitrageTableProps {
  pairs: ArbitragePair[];
  total: number;
}

export function ArbitrageTable({ pairs, total }: ArbitrageTableProps) {
  const params = useParams();
  const teamSlug = params["team-slug"] as string;

  if (pairs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-lg font-medium">No arbitrage pairs found</p>
        <p className="text-sm text-muted-foreground">
          No cross-platform matches detected above the similarity threshold
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[340px]">Matched Pair</TableHead>
            <TableHead className="text-right">Yes Price</TableHead>
            <TableHead className="text-right">Spread</TableHead>
            <TableHead className="text-right">Match</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pairs.map((pair) => (
            <TableRow key={`${pair.polymarketConditionId}-${pair.kalshiTicker}`}>
              {/* Both markets with platform labels and links */}
              <TableCell className="space-y-2 py-3">
                <div className="flex items-start gap-2">
                  <Badge variant="default" className="mt-0.5 shrink-0 text-[10px] uppercase tracking-wider">
                    Poly
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/${teamSlug}/markets/${pair.polymarketConditionId}`}
                      className="group flex items-center gap-1 text-sm font-medium hover:underline"
                    >
                      <span className="line-clamp-1">{pair.polymarketTitle}</span>
                      <ExternalLink className="hidden h-3 w-3 shrink-0 text-muted-foreground group-hover:inline-block" />
                    </Link>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="secondary" className="mt-0.5 shrink-0 text-[10px] uppercase tracking-wider">
                    Kalshi
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/${teamSlug}/markets/${pair.kalshiTicker}`}
                      className="group flex items-center gap-1 text-sm font-medium hover:underline"
                    >
                      <span className="line-clamp-1">{pair.kalshiTitle}</span>
                      <ExternalLink className="hidden h-3 w-3 shrink-0 text-muted-foreground group-hover:inline-block" />
                    </Link>
                  </div>
                </div>
              </TableCell>

              {/* Prices stacked: Poly on top, Kalshi below */}
              <TableCell className="text-right font-mono">
                <div className="space-y-2 py-1">
                  <div className="text-sm">{formatPrice(pair.polymarketYesPrice)}</div>
                  <div className="text-sm">{formatPrice(pair.kalshiYesPrice)}</div>
                </div>
              </TableCell>

              {/* Spread */}
              <TableCell className={`text-right font-mono ${spreadColor(pair.spread)}`}>
                {pair.spread != null
                  ? `${(pair.spread * 100).toFixed(1)}¢`
                  : "—"}
              </TableCell>

              {/* Similarity */}
              <TableCell className="text-right">
                {pair.similarity != null ? (
                  <Badge variant={similarityVariant(pair.similarity)}>
                    {pair.similarity}%
                  </Badge>
                ) : (
                  "—"
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">
        {pairs.length} of {total} matched pairs across platforms
      </p>
    </div>
  );
}
