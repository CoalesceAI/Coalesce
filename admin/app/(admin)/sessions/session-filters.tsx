"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ExportSessionsButton } from "./export-sessions-button";

const STATUSES = ["all", "active", "resolved", "needs_info", "unknown"] as const;

export function SessionFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentStatus = searchParams.get("status") ?? "all";
  const orgFromUrl = searchParams.get("org") ?? "";
  const qFromUrl = searchParams.get("q") ?? "";

  const [orgDraft, setOrgDraft] = useState(orgFromUrl);
  const [qDraft, setQDraft] = useState(qFromUrl);
  const orgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ org: orgDraft, q: qDraft, status: currentStatus });
  latest.current = { org: orgDraft, q: qDraft, status: currentStatus };

  useEffect(() => {
    setOrgDraft(orgFromUrl);
  }, [orgFromUrl]);

  useEffect(() => {
    setQDraft(qFromUrl);
  }, [qFromUrl]);

  function buildParams(overrides: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    for (const [key, value] of Object.entries(overrides)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    return params;
  }

  function pushFromDrafts(org: string, q: string, statusKey: string) {
    const statusVal = statusKey === "all" ? "" : statusKey;
    router.push(
      `/sessions?${buildParams({
        status: statusVal,
        org,
        q,
      }).toString()}`,
    );
  }

  function onOrgChange(value: string) {
    setOrgDraft(value);
    if (orgTimer.current) clearTimeout(orgTimer.current);
    orgTimer.current = setTimeout(() => {
      const { q, status } = latest.current;
      pushFromDrafts(value, q, status);
    }, 400);
  }

  function onSearchChange(value: string) {
    setQDraft(value);
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => {
      const { org, status } = latest.current;
      pushFromDrafts(org, value, status);
    }, 400);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex gap-1">
        {STATUSES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={currentStatus === s ? "default" : "ghost"}
            onClick={() =>
              pushFromDrafts(orgDraft, qDraft, s)
            }
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
        value={orgDraft}
        onChange={(e) => onOrgChange(e.target.value)}
        className="w-36 h-7 text-xs bg-zinc-800 border-zinc-700 text-zinc-100"
      />
      <Input
        placeholder="Search..."
        value={qDraft}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-40 h-7 text-xs bg-zinc-800 border-zinc-700 text-zinc-100"
      />
      <ExportSessionsButton />
    </div>
  );
}
