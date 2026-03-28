import { auth } from "@clerk/nextjs/server";
import { adminFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GenerateKeyButton } from "./generate-key-button";
import { RevokeKeyButton } from "./revoke-key-button";
import { OrgSettingsForm } from "./org-settings-form";
import { IntegrationSnippet } from "./integration-snippet";
import { RotateSecretButton } from "./rotate-secret-button";

interface Org {
  id: string;
  slug: string;
  name: string;
  settings: Record<string, unknown>;
  signing_secret: string;
  created_at: string;
}

interface ApiKey {
  id: string;
  prefix: string;
  label: string | null;
  created_at: string;
  revoked_at: string | null;
}

interface OrgStats {
  total: number;
  resolved: number;
  needs_info: number;
  unknown: number;
  active: number;
  avg_resolution_ms: number | null;
}

function formatMs(ms: number | null): string {
  if (ms === null) return "\u2014";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return null;

  const { slug } = await params;

  let org: Org;
  try {
    org = await adminFetch<Org>(`/admin/orgs/${slug}`, {}, token);
  } catch {
    notFound();
  }

  const [keys, stats] = await Promise.all([
    adminFetch<ApiKey[]>(`/admin/orgs/${slug}/keys`, {}, token),
    adminFetch<OrgStats>(`/admin/orgs/${slug}/stats`, {}, token),
  ]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="text-zinc-500 hover:text-zinc-300 text-sm">
          &larr; Organizations
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">{org.name}</h1>
          <p className="text-sm font-mono text-zinc-500 mt-1">{org.slug}</p>
        </div>
        <span className="text-xs text-zinc-600">
          Created {new Date(org.created_at).toLocaleDateString()}
        </span>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="bg-zinc-800/50 border border-zinc-800">
          <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-zinc-700">
            Overview
          </TabsTrigger>
          <TabsTrigger value="keys" className="text-xs data-[state=active]:bg-zinc-700">
            API Keys ({keys.filter((k) => !k.revoked_at).length})
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs data-[state=active]:bg-zinc-700">
            Settings
          </TabsTrigger>
          <TabsTrigger value="integrate" className="text-xs data-[state=active]:bg-zinc-700">
            Integrate
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-zinc-400 font-medium uppercase tracking-wider">
                  Total
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-zinc-100">{stats.total}</p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-zinc-400 font-medium uppercase tracking-wider">
                  Resolution Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-400">
                  {pct(stats.resolved, stats.total)}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-zinc-400 font-medium uppercase tracking-wider">
                  Avg Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-zinc-100">
                  {formatMs(stats.avg_resolution_ms)}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-zinc-400 font-medium uppercase tracking-wider">
                  Active
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-blue-400">{stats.active}</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex gap-4 text-sm">
            <Link href={`/knowledge/${slug}`} className="text-blue-400 hover:underline">
              Knowledge Base &rarr;
            </Link>
            <Link href={`/sessions?org=${slug}`} className="text-blue-400 hover:underline">
              View Sessions &rarr;
            </Link>
          </div>
        </TabsContent>

        {/* API Keys Tab */}
        <TabsContent value="keys" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-300">API Keys</h2>
            <GenerateKeyButton slug={slug} />
          </div>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-zinc-400">Prefix</TableHead>
                    <TableHead className="text-zinc-400">Label</TableHead>
                    <TableHead className="text-zinc-400">Created</TableHead>
                    <TableHead className="text-zinc-400">Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((key) => (
                    <TableRow
                      key={key.id}
                      className="border-zinc-800 hover:bg-zinc-800/50"
                    >
                      <TableCell className="font-mono text-xs text-zinc-300">
                        {key.prefix}&hellip;
                      </TableCell>
                      <TableCell className="text-xs text-zinc-400">
                        {key.label ?? "\u2014"}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500">
                        {new Date(key.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {key.revoked_at ? (
                          <span className="text-xs px-2 py-0.5 rounded border bg-red-500/20 text-red-400 border-red-500/30">
                            revoked
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded border bg-green-500/20 text-green-400 border-green-500/30">
                            active
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!key.revoked_at && (
                          <RevokeKeyButton slug={slug} keyId={key.id} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {keys.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-zinc-500 text-sm text-center py-8">
                        No API keys yet. Generate one to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
            <div>
              <p className="text-xs text-zinc-300">Signing Secret</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Used for signed URL generation. Rotating invalidates all existing signed URLs.
              </p>
            </div>
            <RotateSecretButton slug={slug} />
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="mt-4">
          <OrgSettingsForm org={org} />
        </TabsContent>

        {/* Integrate Tab */}
        <TabsContent value="integrate" className="mt-4">
          <IntegrationSnippet slug={slug} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
