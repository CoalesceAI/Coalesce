"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ExportSessionsButton } from "./export-sessions-button";
import { useOrg } from "@/lib/org-context";

const STATUSES = ["all", "active", "resolved", "needs_info", "unknown"] as const;

export function SessionFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentOrg } = useOrg();

  const currentStatus = searchParams.get("status") ?? "all";
  const qFromUrl = searchParams.get("q") ?? "";

  const [qDraft, setQDraft] = useState(qFromUrl);
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ q: qDraft, status: currentStatus });
  latest.current = { q: qDraft, status: currentStatus };

  useEffect(() => {
    setQDraft(qFromUrl);
  }, [qFromUrl]);

  // Auto-inject org into URL when org changes
  useEffect(() => {
    const orgInUrl = searchParams.get("org") ?? "";
    const orgSlug = currentOrg?.slug ?? "";
    if (orgSlug && orgInUrl !== orgSlug) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("org", orgSlug);
      params.delete("page");
      router.replace(`/sessions?${params.toString()}`);
    }
  }, [currentOrg?.slug, searchParams, router]);

  function buildHref(overrides: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (currentOrg) params.set("org", currentOrg.slug);
    for (const [key, value] of Object.entries(overrides)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    return `/sessions?${params.toString()}`;
  }

  function onSearchChange(value: string) {
    setQDraft(value);
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => {
      router.push(buildHref({ q: value }));
    }, 400);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex gap-1">
        {STATUSES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={currentStatus === s ? "secondary" : "ghost"}
            onClick={() =>
              router.push(
                buildHref({ status: s === "all" ? "" : s }),
              )
            }
            className="text-xs h-7"
          >
            {s === "all" ? "All" : s.replace("_", " ")}
          </Button>
        ))}
      </div>
      <Input
        placeholder="Search..."
        value={qDraft}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-40 h-7 text-xs"
      />
      <ExportSessionsButton />
    </div>
  );
}
