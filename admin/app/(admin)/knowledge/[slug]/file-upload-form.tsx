"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getApoyoApiBase } from "@/lib/api-base";
const ALLOWED_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/json",
];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function FileUploadForm({ slug }: { slug: string }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    const isAllowedExt = ["pdf", "md", "txt", "json", "mdx"].includes(ext ?? "");
    if (!ALLOWED_TYPES.includes(f.type) && !isAllowedExt) {
      toast.error("Only PDF, Markdown, plain text, and JSON files are supported");
      return;
    }
    if (f.size > MAX_SIZE) {
      toast.error("File too large (max 10MB)");
      return;
    }
    setFile(f);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    try {
      const token = await getToken();
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

      const urlRes = await fetch(`${getApoyoApiBase()}/admin/orgs/${slug}/docs/upload-url`, {
        method: "POST",
        headers,
        body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream" }),
      });

      if (urlRes.ok) {
        const { uploadUrl, storageKey } = await urlRes.json();

        await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });

        const confirmRes = await fetch(`${getApoyoApiBase()}/admin/orgs/${slug}/docs/upload`, {
          method: "POST",
          headers,
          body: JSON.stringify({ storageKey, filename: file.name }),
        });
        if (!confirmRes.ok) {
          const body = await confirmRes.json();
          toast.error(body.error ?? "Upload processing failed");
          return;
        }
      } else {
        const formData = new FormData();
        formData.append("file", file);
        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        if (!uploadRes.ok) {
          toast.error("File upload failed");
          return;
        }
        const { blobUrl } = await uploadRes.json();
        const confirmRes = await fetch(`${getApoyoApiBase()}/admin/orgs/${slug}/docs/upload`, {
          method: "POST",
          headers,
          body: JSON.stringify({ blobUrl, filename: file.name }),
        });
        if (!confirmRes.ok) {
          const body = await confirmRes.json();
          toast.error(body.error ?? "Upload processing failed");
          return;
        }
      }

      toast.success("File uploaded and processed");
      setFile(null);
      router.refresh();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
              dragOver
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/50"
            }`}
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <input
              id="file-input"
              type="file"
              accept=".pdf,.md,.txt,.json,.mdx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {file ? (
              <p className="text-sm text-foreground">{file.name} ({(file.size / 1024).toFixed(0)}KB)</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Drop a file here or click to browse</p>
                <p className="text-xs text-muted-foreground/60 mt-1">PDF, Markdown, text, JSON (max 10MB)</p>
              </>
            )}
          </div>
          <Button type="submit" disabled={!file || loading} className="w-full">
            {loading ? "Uploading..." : "Upload"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
