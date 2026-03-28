"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { getCoalesceApiBase } from "@/lib/api-base";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function AddUrlForm({ slug }: { slug: string }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `${getCoalesceApiBase()}/admin/orgs/${slug}/docs/url`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ url }),
        },
      );
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to add URL");
        return;
      }
      setUrl("");
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        router.refresh();
      }, 2000);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="doc-url" className="text-muted-foreground text-xs">
              URL
            </Label>
            <Input
              id="doc-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://docs.example.com/api"
              required
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          {submitted && (
            <p className="text-xs text-green-400">
              Scraping started — check status in the table above.
            </p>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Submitting…" : "Scrape this page"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
