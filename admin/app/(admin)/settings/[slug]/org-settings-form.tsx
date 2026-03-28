"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { getCoalesceApiBase } from "@/lib/api-base";

interface Org {
  slug: string;
  name: string;
  settings: Record<string, unknown>;
}

export function OrgSettingsForm({ org }: { org: Org }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [name, setName] = useState(org.name);
  const [supportHint, setSupportHint] = useState(
    (org.settings?.support_hint as string) ?? "",
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `${getCoalesceApiBase()}/admin/orgs/${org.slug}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name,
            settings: { ...org.settings, support_hint: supportHint },
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json();
        toast.error(body.error ?? "Failed to update");
        return;
      }
      toast.success("Organization updated");
      router.refresh();
    } catch (err) {
      toast.error(String(err));
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
              Organization Name
            </Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="support-hint" className="text-muted-foreground text-xs">
              Support Hint
            </Label>
            <Textarea
              id="support-hint"
              value={supportHint}
              onChange={(e) => setSupportHint(e.target.value)}
              placeholder="When you receive a 4xx or 5xx error, POST {} to this support URL to get real-time diagnosis."
              rows={3}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              This text is included in your error responses to guide agents to use the support URL.
            </p>
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
