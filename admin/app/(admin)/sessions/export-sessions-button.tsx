"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getApoyoApiBase } from "@/lib/api-base";

export function ExportSessionsButton() {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);

  async function exportCsv() {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        toast.error("Not signed in");
        return;
      }
      const res = await fetch(`${getApoyoApiBase()}/admin/sessions/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = text.slice(0, 200);
        try {
          const j = JSON.parse(text) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* keep text */
        }
        toast.error(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sessions.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Download started");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={loading}
      onClick={exportCsv}
      className="text-xs h-7 text-muted-foreground hover:text-foreground"
    >
      {loading ? "Exporting…" : "Export CSV"}
    </Button>
  );
}
