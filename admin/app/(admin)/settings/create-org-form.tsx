"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@clerk/nextjs";
import { getApoyoApiBase } from "@/lib/api-base";
import { useOrg } from "@/lib/org-context";

export function CreateOrgForm() {
  const { getToken } = useAuth();
  const { refreshOrgs } = useOrg();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${getApoyoApiBase()}/admin/orgs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, slug }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to create org");
        return;
      }
      await refreshOrgs();
      setName("");
      setSlug("");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="org-name" className="text-muted-foreground text-xs">
              Name
            </Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Inc"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-slug" className="text-muted-foreground text-xs">
              Slug
            </Label>
            <Input
              id="org-slug"
              value={slug}
              onChange={(e) =>
                setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))
              }
              placeholder="acme"
              required
              className="font-mono"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creating\u2026" : "Create Organization"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
