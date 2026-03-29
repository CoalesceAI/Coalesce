"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getApoyoApiBase } from "@/lib/api-base";

export function ContentPreview({ slug, sourceId }: { slug: string; sourceId: string }) {
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<{ title: string; content: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadContent() {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(`${getApoyoApiBase()}/admin/orgs/${slug}/docs/${sourceId}/content`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError("No content available");
        return;
      }
      const data = await res.json();
      setContent(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    loadContent();
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={handleOpen}
        className="text-xs text-muted-foreground hover:text-foreground h-7"
      >
        Preview
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate">
              {content?.title ?? "Content Preview"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {loading && <p className="text-sm text-muted-foreground p-4">Loading...</p>}
            {error && <p className="text-sm text-destructive p-4">{error}</p>}
            {content && (
              <pre className="text-xs text-foreground/80 bg-muted p-4 rounded whitespace-pre-wrap font-mono leading-relaxed">
                {content.content.slice(0, 10000)}
                {content.content.length > 10000 && "\n\n... (truncated)"}
              </pre>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
