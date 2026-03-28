"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { getCoalesceApiBase } from "@/lib/api-base";
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

      // Step 1: Get presigned upload URL from backend
      const urlRes = await fetch(`${getCoalesceApiBase()}/admin/orgs/${slug}/docs/upload-url`, {
        method: "POST",
        headers,
        body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream" }),
      });

      if (urlRes.ok) {
        const { uploadUrl, storageKey } = await urlRes.json();

        // Step 2: Upload directly to Railway Buckets
        await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });

        // Step 3: Confirm upload — backend extracts text
        const confirmRes = await fetch(`${getCoalesceApiBase()}/admin/orgs/${slug}/docs/upload`, {
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
        // Fallback: upload via legacy blob path if presigned URL fails
        // (e.g., when Railway Buckets not configured)
        const formData = new FormData();
        formData.append("file", file);
        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        if (!uploadRes.ok) {
          toast.error("File upload failed");
          return;
        }
        const { blobUrl } = await uploadRes.json();
        const confirmRes = await fetch(`${getCoalesceApiBase()}/admin/orgs/${slug}/docs/upload`, {
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
    <Card className="bg-zinc-900 border-zinc-800">
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
                ? "border-blue-500 bg-blue-500/10"
                : "border-zinc-700 hover:border-zinc-600"
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
              <p className="text-sm text-zinc-300">{file.name} ({(file.size / 1024).toFixed(0)}KB)</p>
            ) : (
              <>
                <p className="text-sm text-zinc-400">Drop a file here or click to browse</p>
                <p className="text-xs text-zinc-600 mt-1">PDF, Markdown, text, JSON (max 10MB)</p>
              </>
            )}
          </div>
          <Button
            type="submit"
            disabled={!file || loading}
            className="w-full bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
          >
            {loading ? "Uploading..." : "Upload"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
