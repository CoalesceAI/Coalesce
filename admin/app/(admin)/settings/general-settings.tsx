"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { getApoyoApiBase } from "@/lib/api-base";
import { useOrg, type OrgWithRole } from "@/lib/org-context";

export function OrgGeneralSettings({ org }: { org: OrgWithRole }) {
  const { getToken } = useAuth();
  const { refreshOrgs } = useOrg();
  const isAdmin = org.role === "admin";

  const [name, setName] = useState(org.name);
  const [savingName, setSavingName] = useState(false);

  const [supportHint, setSupportHint] = useState(
    (org.settings?.support_hint as string) ?? "",
  );
  const [savingHint, setSavingHint] = useState(false);

  async function patchOrg(body: Record<string, unknown>) {
    const token = await getToken();
    const res = await fetch(`${getApoyoApiBase()}/admin/orgs/${org.slug}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error((data as { error?: string }).error ?? "Failed to update");
    }
    await refreshOrgs();
  }

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    try {
      await patchOrg({ name });
      toast.success("Organization name updated");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSavingName(false);
    }
  }

  async function saveHint(e: React.FormEvent) {
    e.preventDefault();
    setSavingHint(true);
    try {
      await patchOrg({ settings: { ...org.settings, support_hint: supportHint } });
      toast.success("Support hint updated");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSavingHint(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Organization Details card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organization Details</CardTitle>
          <CardDescription>Update your organization name.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveDetails} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="org-name">Name</Label>
                <Input
                  id="org-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={!isAdmin}
                  placeholder="My Company"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input
                  value={org.slug}
                  disabled
                  className="font-mono text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Used in your support URL — cannot be changed.
                </p>
              </div>
            </div>
            {isAdmin && (
              <div className="flex justify-end">
                <Button type="submit" disabled={savingName} size="sm">
                  {savingName ? "Saving…" : "Save Name"}
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Support Hint card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Support Hint</CardTitle>
          <CardDescription>
            Included in your API error responses to guide agents toward the support URL.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveHint} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="support-hint">Hint text</Label>
              <Textarea
                id="support-hint"
                value={supportHint}
                onChange={(e) => setSupportHint(e.target.value)}
                placeholder="When you receive a 4xx or 5xx error, POST to the support URL for real-time diagnosis."
                rows={3}
                disabled={!isAdmin}
              />
              <p className="text-xs text-muted-foreground">
                Your support URL:{" "}
                <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
                  {getApoyoApiBase()}/support/{org.slug}
                </code>
              </p>
            </div>
            {isAdmin && (
              <div className="flex justify-end">
                <Button type="submit" disabled={savingHint} size="sm">
                  {savingHint ? "Saving…" : "Save Hint"}
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
