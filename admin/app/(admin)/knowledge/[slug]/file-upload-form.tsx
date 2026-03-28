"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function FileUploadForm({ slug }: { slug: string }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [dragging, setDragging] = useState(false);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }

  async function handleUpload() {
    if (!file) return;
    setError("");
    setLoading(true);
    try {
      const token = await getToken();

      // Step 1: upload to Vercel Blob via Next.js API route
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) {
        const body = await uploadRes.json();
        setError(body.error ?? "Upload failed");
        return;
      }
      const { blobUrl } = await uploadRes.json() as { blobUrl: string };

      // Step 2: send blobUrl to Hono for text extraction
      const ingestRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"}/admin/orgs/${slug}/docs/upload`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ blobUrl, filename: file.name }),
        },
      );
      if (!ingestRes.ok) {
        const body = await ingestRes.json();
        setError(body.error ?? "Ingest failed");
        return;
      }

      setFile(null);
      setDone(true);
      setTimeout(() => {
        setDone(false);
        router.refresh();
      }, 2000);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="pt-4 space-y-3">
        <div
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors ${
            dragging
              ? "border-blue-500 bg-blue-500/10"
              : "border-zinc-700 hover:border-zinc-600"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.md,.txt"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <p className="text-sm text-zinc-300">{file.name}</p>
          ) : (
            <p className="text-sm text-zinc-500">
              Drag & drop or click to upload
              <br />
              <span className="text-xs">.pdf, .md, .txt</span>
            </p>
          )}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {done && <p className="text-xs text-green-400">File uploaded and indexed.</p>}
        <Button
          onClick={handleUpload}
          disabled={!file || loading}
          className="w-full bg-zinc-100 text-zinc-900 hover:bg-zinc-200 disabled:opacity-40"
        >
          {loading ? "Uploading…" : "Upload"}
        </Button>
      </CardContent>
    </Card>
  );
}
