"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const STATUSES = ["all", "active", "resolved", "needs_info", "unknown"] as const;

export function SessionFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentStatus = searchParams.get("status") ?? "all";
  const currentOrg = searchParams.get("org") ?? "";
  const currentSearch = searchParams.get("q") ?? "";

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`/sessions?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex gap-1">
        {STATUSES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={currentStatus === s ? "default" : "ghost"}
            onClick={() => updateParams({ status: s === "all" ? "" : s })}
            className={`text-xs h-7 ${
              currentStatus === s
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-400 hover:text-zinc-100"
            }`}
          >
            {s === "all" ? "All" : s.replace("_", " ")}
          </Button>
        ))}
      </div>
      <Input
        placeholder="Filter by org slug..."
        value={currentOrg}
        onChange={(e) => updateParams({ org: e.target.value })}
        className="w-36 h-7 text-xs bg-zinc-800 border-zinc-700 text-zinc-100"
      />
      <Input
        placeholder="Search..."
        value={currentSearch}
        onChange={(e) => updateParams({ q: e.target.value })}
        className="w-40 h-7 text-xs bg-zinc-800 border-zinc-700 text-zinc-100"
      />
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          const baseUrl = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"}/admin/sessions/export`;
          window.open(baseUrl, "_blank");
        }}
        className="text-xs h-7 text-zinc-400 hover:text-zinc-100"
      >
        Export CSV
      </Button>
    </div>
  );
}
