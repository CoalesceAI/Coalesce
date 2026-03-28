"use client";

import { useState, useEffect } from "react";
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
import { getCoalesceApiBase } from "@/lib/api-base";

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

export function IntegrationsPanel({ slug }: { slug: string }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);

  // Notion connect
  const [connectOpen, setConnectOpen] = useState(false);
  const [notionToken, setNotionToken] = useState("");
  const [connecting, setConnecting] = useState(false);

  // Notion page picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);

  async function loadIntegrations() {
    try {
      const token = await getToken();
      const res = await fetch(`${getCoalesceApiBase()}/admin/orgs/${slug}/integrations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setIntegrations(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadIntegrations(); }, [slug]);

  const isNotionConnected = integrations.some((i) => i.provider === "notion");

  async function connectNotion() {
    setConnecting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${getCoalesceApiBase()}/admin/orgs/${slug}/integrations/notion`, {
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
    await fetch(`${getCoalesceApiBase()}/admin/orgs/${slug}/integrations/notion`, {
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
      const res = await fetch(`${getCoalesceApiBase()}/admin/orgs/${slug}/integrations/notion/pages`, {
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
      const res = await fetch(`${getCoalesceApiBase()}/admin/orgs/${slug}/docs/notion`, {
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
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-sm text-zinc-300">Integrations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Notion */}
        <div className="flex items-center justify-between p-3 border border-zinc-800 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-lg">N</span>
            <div>
              <p className="text-sm text-zinc-200">Notion</p>
              <p className="text-xs text-zinc-500">Import pages from your Notion workspace</p>
            </div>
          </div>
          {isNotionConnected ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-400">Connected</span>
              <Button size="sm" variant="ghost" onClick={openPagePicker} className="text-xs text-blue-400">
                Import Pages
              </Button>
              <Button size="sm" variant="ghost" onClick={disconnectNotion} className="text-xs text-red-400">
                Disconnect
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => setConnectOpen(true)} className="text-xs bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
              Connect
            </Button>
          )}
        </div>

        {/* GitHub placeholder */}
        <div className="flex items-center justify-between p-3 border border-zinc-800 rounded-lg opacity-50">
          <div className="flex items-center gap-3">
            <span className="text-lg">GH</span>
            <div>
              <p className="text-sm text-zinc-200">GitHub</p>
              <p className="text-xs text-zinc-500">Import docs from repositories</p>
            </div>
          </div>
          <span className="text-xs text-zinc-500">Coming soon</span>
        </div>

        {/* Linear placeholder */}
        <div className="flex items-center justify-between p-3 border border-zinc-800 rounded-lg opacity-50">
          <div className="flex items-center gap-3">
            <span className="text-lg">LN</span>
            <div>
              <p className="text-sm text-zinc-200">Linear</p>
              <p className="text-xs text-zinc-500">Import known issues and bug reports</p>
            </div>
          </div>
          <span className="text-xs text-zinc-500">Coming soon</span>
        </div>

        {/* Connect Notion dialog */}
        <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
          <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
            <DialogHeader>
              <DialogTitle>Connect Notion</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Notion Integration Token</Label>
                <Input
                  value={notionToken}
                  onChange={(e) => setNotionToken(e.target.value)}
                  placeholder="ntn_..."
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 font-mono text-sm"
                />
                <p className="text-xs text-zinc-500">
                  Create an internal integration at{" "}
                  <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                    notion.so/my-integrations
                  </a>{" "}
                  and paste the token here.
                </p>
              </div>
              <Button
                onClick={connectNotion}
                disabled={!notionToken || connecting}
                className="w-full bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
              >
                {connecting ? "Connecting..." : "Connect"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Page picker dialog */}
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg max-h-[70vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Import Notion Pages</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto space-y-2">
              {loadingPages && <p className="text-sm text-zinc-500 p-4">Loading pages...</p>}
              {pages.map((page) => (
                <div key={page.id} className="flex items-center justify-between p-2 hover:bg-zinc-800 rounded">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200 truncate">{page.title}</p>
                    <p className="text-xs text-zinc-500">{new Date(page.lastEdited).toLocaleDateString()}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => importPage(page.id)}
                    disabled={importing === page.id}
                    className="text-xs text-blue-400 shrink-0"
                  >
                    {importing === page.id ? "Importing..." : "Import"}
                  </Button>
                </div>
              ))}
              {!loadingPages && pages.length === 0 && (
                <p className="text-sm text-zinc-500 p-4 text-center">
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
