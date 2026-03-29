"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { getApoyoApiBase } from "@/lib/api-base";

interface NotionPage {
  id: string;
  title: string;
  url: string;
  lastEdited: string;
}

interface Integration {
  id: string;
  provider: string;
  connected_at: string;
}

async function readApiErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { error?: string; message?: string };
    return j.error ?? j.message ?? text.slice(0, 200);
  } catch {
    const t = text.trimStart().toLowerCase();
    if (t.startsWith("<!doctype") || t.startsWith("<html")) {
      return "API returned HTML instead of JSON. Set NEXT_PUBLIC_API_URL in admin/.env.local to your Hono API (e.g. http://localhost:3000).";
    }
    return text.slice(0, 200) || `Request failed (${res.status})`;
  }
}

export function IntegrationsPanel({ slug }: { slug: string }) {
  const router = useRouter();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);

  const [connectOpen, setConnectOpen] = useState(false);
  const [notionToken, setNotionToken] = useState("");
  const [connecting, setConnecting] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);

  const loadIntegrations = useCallback(async () => {
    if (!isLoaded) return;

    try {
      if (!isSignedIn) {
        toast.error("Sign in to load integrations.");
        return;
      }
      const token = await getToken();
      if (!token) {
        toast.error("Could not get a session token. Try refreshing the page.");
        return;
      }
      const res = await fetch(`${getApoyoApiBase()}/admin/orgs/${slug}/integrations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        let msg = await readApiErrorMessage(res);
        if (res.status === 401) {
          msg += " Ensure CLERK_SECRET_KEY matches between the admin app and the API.";
        }
        toast.error(msg);
        return;
      }
      setIntegrations(await res.json());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [slug, getToken, isLoaded, isSignedIn]);

  useEffect(() => {
    setLoading(true);
    void loadIntegrations();
  }, [loadIntegrations]);

  const isNotionConnected = integrations.some((i) => i.provider === "notion");

  async function connectNotion() {
    setConnecting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${getApoyoApiBase()}/admin/orgs/${slug}/integrations/notion`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ access_token: notionToken }),
      });
      if (!res.ok) {
        const body = await res.json();
        toast.error(body.error ?? "Failed to connect");
        return;
      }
      toast.success("Notion connected");
      setConnectOpen(false);
      setNotionToken("");
      await loadIntegrations();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setConnecting(false);
    }
  }

  async function disconnectNotion() {
    const token = await getToken();
    await fetch(`${getApoyoApiBase()}/admin/orgs/${slug}/integrations/notion`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    toast.success("Notion disconnected");
    await loadIntegrations();
  }

  async function openPagePicker() {
    setPickerOpen(true);
    setLoadingPages(true);
    try {
      const token = await getToken();
      const res = await fetch(`${getApoyoApiBase()}/admin/orgs/${slug}/integrations/notion/pages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setPages(await res.json());
      else toast.error("Failed to load Notion pages");
    } finally {
      setLoadingPages(false);
    }
  }

  async function importPage(pageId: string) {
    setImporting(pageId);
    try {
      const token = await getToken();
      const res = await fetch(`${getApoyoApiBase()}/admin/orgs/${slug}/docs/notion`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ page_id: pageId }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Imported "${data.title}"`);
        router.refresh();
      } else {
        const body = await res.json();
        toast.error(body.error ?? "Import failed");
      }
    } finally {
      setImporting(null);
    }
  }

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Integrations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Notion */}
        <div className="flex items-center justify-between p-3 border border-border rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-lg">N</span>
            <div>
              <p className="text-sm text-foreground">Notion</p>
              <p className="text-xs text-muted-foreground">Import pages from your Notion workspace</p>
            </div>
          </div>
          {isNotionConnected ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-400">Connected</span>
              <Button size="sm" variant="ghost" onClick={openPagePicker} className="text-xs text-primary">
                Import Pages
              </Button>
              <Button size="sm" variant="ghost" onClick={disconnectNotion} className="text-xs text-red-400">
                Disconnect
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => setConnectOpen(true)} className="text-xs">
              Connect
            </Button>
          )}
        </div>

        {/* GitHub placeholder */}
        <div className="flex items-center justify-between p-3 border border-border rounded-lg opacity-50">
          <div className="flex items-center gap-3">
            <span className="text-lg">GH</span>
            <div>
              <p className="text-sm text-foreground">GitHub</p>
              <p className="text-xs text-muted-foreground">Import docs from repositories</p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">Coming soon</span>
        </div>

        {/* Linear placeholder */}
        <div className="flex items-center justify-between p-3 border border-border rounded-lg opacity-50">
          <div className="flex items-center gap-3">
            <span className="text-lg">LN</span>
            <div>
              <p className="text-sm text-foreground">Linear</p>
              <p className="text-xs text-muted-foreground">Import known issues and bug reports</p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">Coming soon</span>
        </div>

        {/* Connect Notion dialog */}
        <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect Notion</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Notion Integration Token</Label>
                <Input
                  value={notionToken}
                  onChange={(e) => setNotionToken(e.target.value)}
                  placeholder="ntn_..."
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Create an internal integration at{" "}
                  <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    notion.so/my-integrations
                  </a>{" "}
                  and paste the token here.
                </p>
              </div>
              <Button
                onClick={connectNotion}
                disabled={!notionToken || connecting}
                className="w-full"
              >
                {connecting ? "Connecting..." : "Connect"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Page picker dialog */}
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent className="max-w-lg max-h-[70vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Import Notion Pages</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto space-y-2">
              {loadingPages && <p className="text-sm text-muted-foreground p-4">Loading pages...</p>}
              {pages.map((page) => (
                <div key={page.id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{page.title}</p>
                    <p className="text-xs text-muted-foreground">{new Date(page.lastEdited).toLocaleDateString()}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => importPage(page.id)}
                    disabled={importing === page.id}
                    className="text-xs text-primary shrink-0"
                  >
                    {importing === page.id ? "Importing..." : "Import"}
                  </Button>
                </div>
              ))}
              {!loadingPages && pages.length === 0 && (
                <p className="text-sm text-muted-foreground p-4 text-center">
                  No pages found. Make sure you&apos;ve shared pages with the integration.
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
