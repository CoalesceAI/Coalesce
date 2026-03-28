"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface GeneratedKey {
  id: string;
  rawKey: string;
}

export function GenerateKeyButton({ slug }: { slug: string }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GeneratedKey | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"}/admin/orgs/${slug}/keys`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ label: label || undefined }),
        },
      );
      const data = await res.json();
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setOpen(false);
    setLabel("");
    setResult(null);
    setCopied(false);
    router.refresh();
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.rawKey);
    setCopied(true);
  }

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200 text-xs"
      >
        Generate Key
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">
              {result ? "API Key Generated" : "Generate API Key"}
            </DialogTitle>
          </DialogHeader>

          {!result ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="key-label" className="text-zinc-400 text-xs">
                  Label (optional)
                </Label>
                <Input
                  id="key-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. production"
                  className="bg-zinc-800 border-zinc-700 text-zinc-100"
                />
              </div>
              <Button
                onClick={generate}
                disabled={loading}
                className="w-full bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
              >
                {loading ? "Generating…" : "Generate"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-yellow-400">
                Copy this key now — it will not be shown again.
              </p>
              <div className="flex gap-2">
                <code className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-xs font-mono text-zinc-300 break-all">
                  {result.rawKey}
                </code>
                <Button
                  size="sm"
                  onClick={copy}
                  className="shrink-0 bg-zinc-700 hover:bg-zinc-600 text-zinc-100"
                >
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
              <Button onClick={close} className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100">
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
