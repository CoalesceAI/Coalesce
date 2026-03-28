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
import Link from "next/link";
import { notFound } from "next/navigation";
import { GenerateKeyButton } from "./generate-key-button";
import { RevokeKeyButton } from "./revoke-key-button";

interface Org {
  id: string;
  slug: string;
  name: string;
  created_at: string;
}

interface ApiKey {
  id: string;
  prefix: string;
  label: string | null;
  created_at: string;
  revoked_at: string | null;
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

  const keys = await adminFetch<ApiKey[]>(
    `/admin/orgs/${slug}/keys`,
    {},
    token,
  );

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="text-zinc-500 hover:text-zinc-300 text-sm">
          ← Settings
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">{org.name}</h1>
        <p className="text-sm font-mono text-zinc-500 mt-1">{org.slug}</p>
      </div>

      <div className="space-y-4">
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
                      {key.prefix}…
                    </TableCell>
                    <TableCell className="text-xs text-zinc-400">
                      {key.label ?? "—"}
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
                      No API keys yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
