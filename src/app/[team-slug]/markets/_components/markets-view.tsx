"use client";

import { useState, useMemo } from "react";
import { useMarkets } from "@/hooks/use-markets";
import { useDebounce } from "@/hooks/use-debounce";
import PageContainer from "@/components/layouts/page-container";
import { MarketTable } from "./market-table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

export default function MarketsView() {
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState<string>("all");
  const [sort, setSort] = useState("volume");

  const debouncedSearch = useDebounce(search, 400);

  const params = useMemo(
    () => ({
      search: debouncedSearch.length >= 3 ? debouncedSearch : undefined,
      platform: platform === "all" ? undefined : (platform as "polymarket" | "kalshi"),
      sort,
      status: "open" as const,
      limit: 50,
    }),
    [debouncedSearch, platform, sort],
  );

  const { data, isLoading, error } = useMarkets(params);

  return (
    <PageContainer scrollable>
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Markets</h2>
          <p className="text-muted-foreground">
            Live prediction markets across Polymarket and Kalshi
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search markets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={platform} onValueChange={setPlatform}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Platforms</SelectItem>
              <SelectItem value="polymarket">Polymarket</SelectItem>
              <SelectItem value="kalshi">Kalshi</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="volume">Volume</SelectItem>
              <SelectItem value="open_interest">Open Interest</SelectItem>
              <SelectItem value="price_desc">Price (High)</SelectItem>
              <SelectItem value="price_asc">Price (Low)</SelectItem>
              <SelectItem value="created">Newest</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load markets. Please try again.
          </div>
        )}

        <MarketTable
          markets={data?.markets ?? []}
          isLoading={isLoading}
          total={data?.total ?? 0}
        />
      </div>
    </PageContainer>
  );
}
