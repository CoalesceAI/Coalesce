"use client";

import type { Trade } from "@/types/market";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";

interface TradesTableProps {
  trades: Trade[];
}

export function TradesTable({ trades }: TradesTableProps) {
  if (trades.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No trades yet
      </p>
    );
  }

  return (
    <div className="max-h-[400px] overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Side</TableHead>
            <TableHead>Outcome</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((t, i) => (
            <TableRow key={`${t.tx_hash}-${i}`}>
              <TableCell>
                <span
                  className={
                    t.side === "BUY"
                      ? "font-medium text-green-600 dark:text-green-400"
                      : "font-medium text-red-600 dark:text-red-400"
                  }
                >
                  {t.side}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {t.outcome_label || (t.is_yes_side ? "Yes" : "No")}
              </TableCell>
              <TableCell className="text-right font-mono">
                {(t.price * 100).toFixed(1)}¢
              </TableCell>
              <TableCell className="text-right font-mono">
                ${t.amount_usd.toFixed(2)}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {formatDistanceToNow(new Date(t.timestamp * 1000), {
                  addSuffix: true,
                })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
