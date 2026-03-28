"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getCoalesceApiBase } from "@/lib/api-base";
import { Plus } from "lucide-react";

interface ApiKey {
  id: string;
  prefix: string;
  label: string | null;
  created_at: string;
  revoked_at: string | null;
}

export function OrgApiKeys({ slug }: { slug: string }) {
  const { getToken } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [rotateConfirm, setRotateConfirm] = useState(false);
  const [rotating, setRotating] = useState(false);

  const fetchKeys = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${getCoalesceApiBase()}/admin/orgs/${slug}/keys`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setKeys(await res.json());
    } finally {
      setLoading(false);
    }
  }, [getToken, slug]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  async function generateKey() {
    setGenerating(true);
    try {
      const token = await getToken();
      const res = await fetch(`${getCoalesceApiBase()}/admin/orgs/${slug}/keys`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ label: newKeyLabel || undefined }),
      });
      const data = await res.json();
      setGeneratedKey(data.rawKey);
      fetchKeys();
    } finally {
      setGenerating(false);
    }
  }

  async function revokeKey(keyId: string) {
    setRevoking(true);
    try {
      const token = await getToken();
      await fetch(`${getCoalesceApiBase()}/admin/orgs/${slug}/keys/${keyId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("API key revoked");
      fetchKeys();
    } finally {
      setRevoking(false);
      setConfirmRevoke(null);
    }
  }

  async function rotateSecret() {
    setRotating(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `${getCoalesceApiBase()}/admin/orgs/${slug}/signing-secret/rotate`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        toast.success("Signing secret rotated. Existing signed URLs invalidated.");
      } else {
        toast.error("Failed to rotate signing secret");
      }
    } finally {
      setRotating(false);
      setRotateConfirm(false);
    }
  }

  function closeGenerateDialog() {
    setGenerateOpen(false);
    setNewKeyLabel("");
    setGeneratedKey(null);
    setCopied(false);
  }

  const activeKeys = keys.filter((k) => !k.revoked_at);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">
            API Keys ({activeKeys.length})
          </CardTitle>
          <Button size="sm" onClick={() => setGenerateOpen(true)} className="text-xs">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Generate Key
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Prefix</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-mono text-xs">
                    {key.prefix}&hellip;
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {key.label ?? "\u2014"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(key.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {key.revoked_at ? (
                      <Badge variant="destructive" className="text-xs">
                        revoked
                      </Badge>
                    ) : (
                      <Badge variant="default" className="text-xs">
                        active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!key.revoked_at && (
                      confirmRevoke === key.id ? (
                        <div className="flex items-center gap-1 justify-end">
                          <span className="text-xs text-muted-foreground">Confirm?</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => revokeKey(key.id)}
                            disabled={revoking}
                            className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7"
                          >
                            {revoking ? "\u2026" : "Yes"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmRevoke(null)}
                            className="text-xs text-muted-foreground hover:text-foreground h-7"
                          >
                            No
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmRevoke(key.id)}
                          className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7"
                        >
                          Revoke
                        </Button>
                      )
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && keys.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-muted-foreground text-sm text-center py-8"
                  >
                    No API keys yet. Generate one to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5 min-w-0">
            <CardTitle className="text-base">Signing secret</CardTitle>
            <CardDescription>
              Used for signed URL generation. Rotating invalidates all existing
              signed URLs.
            </CardDescription>
          </div>
          <div className="shrink-0 w-full sm:w-auto sm:pt-0.5">
            {rotateConfirm ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <span className="text-xs text-muted-foreground">
                  Invalidate all signed URLs?
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={rotateSecret}
                    disabled={rotating}
                  >
                    {rotating ? "Rotating…" : "Confirm"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRotateConfirm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setRotateConfirm(true)}
              >
                Rotate secret
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      <Dialog open={generateOpen} onOpenChange={(v) => { if (!v) closeGenerateDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {generatedKey ? "API Key Generated" : "Generate API Key"}
            </DialogTitle>
          </DialogHeader>

          {!generatedKey ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="key-label" className="text-muted-foreground text-xs">
                  Label (optional)
                </Label>
                <Input
                  id="key-label"
                  value={newKeyLabel}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                  placeholder="e.g. production"
                />
              </div>
              <Button onClick={generateKey} disabled={generating} className="w-full">
                {generating ? "Generating\u2026" : "Generate"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-amber-400">
                Copy this key now — it will not be shown again.
              </p>
              <div className="flex gap-2">
                <code className="flex-1 bg-muted border border-border rounded px-3 py-2 text-xs font-mono text-foreground/80 break-all">
                  {generatedKey}
                </code>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(generatedKey);
                    setCopied(true);
                  }}
                  className="shrink-0"
                >
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
              <Button variant="outline" onClick={closeGenerateDialog} className="w-full">
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
