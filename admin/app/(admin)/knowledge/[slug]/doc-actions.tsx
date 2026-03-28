"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { getCoalesceApiBase } from "@/lib/api-base";
import { Button } from "@/components/ui/button";

export function DocActions({
  slug,
  sourceId,
  sourceType,
}: {
  slug: string;
  sourceId: string;
  sourceType: string;
}) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [loading, setLoading] = useState<"sync" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function sync() {
    setLoading("sync");
    try {
      const token = await getToken();
      await fetch(
        `${getCoalesceApiBase()}/admin/orgs/${slug}/docs/${sourceId}/sync`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function del() {
    setLoading("delete");
    try {
      const token = await getToken();
      await fetch(
        `${getCoalesceApiBase()}/admin/orgs/${slug}/docs/${sourceId}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
      router.refresh();
    } finally {
      setLoading(null);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      {sourceType === "url_crawl" && (
        <Button
          size="sm"
          variant="ghost"
          onClick={sync}
          disabled={loading !== null}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {loading === "sync" ? "Syncing…" : "Sync"}
        </Button>
      )}

      {!confirmDelete ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirmDelete(true)}
          disabled={loading !== null}
          className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
        >
          Delete
        </Button>
      ) : (
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Sure?</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={del}
            disabled={loading !== null}
            className="text-xs text-red-400 hover:text-red-300"
          >
            {loading === "delete" ? "…" : "Yes"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirmDelete(false)}
            className="text-xs text-muted-foreground"
          >
            No
          </Button>
        </div>
      )}
    </div>
  );
}
