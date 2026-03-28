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
import { AddUrlForm } from "./add-url-form";
import { FileUploadForm } from "./file-upload-form";
import { DocActions } from "./doc-actions";
import { ContentPreview } from "./content-preview";
import { IntegrationsPanel } from "./integrations";

interface DocSource {
  id: string;
  source_type: string;
  source_path: string;
  title: string | null;
  status: string;
  last_sync_at: string | null;
  error_message: string | null;
  content_count: number;
}

const STATUS_COLORS: Record<string, string> = {
  ready: "bg-green-500/20 text-green-400 border-green-500/30",
  crawling: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  processing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  pending: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  error: "bg-red-500/20 text-red-400 border-red-500/30",
};

const TYPE_ICONS: Record<string, string> = {
  url_crawl: "\uD83C\uDF10",
  file_upload: "\uD83D\uDCC4",
  notion: "\uD83D\uDCD3",
  raw: "\uD83D\uDCDD",
  mdx: "\uD83D\uDCDD",
  manual: "\uD83D\uDCDD",
};

export default async function KnowledgeOrgPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return null;

  const { slug } = await params;

  let docs: DocSource[] = [];
  try {
    docs = await adminFetch<DocSource[]>(`/admin/orgs/${slug}/docs`, {}, token);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/knowledge" className="text-zinc-500 hover:text-zinc-300 text-sm">
          &larr; Knowledge Base
        </Link>
      </div>

      <h1 className="text-2xl font-semibold text-zinc-100">
        {slug} &mdash; Knowledge Base
      </h1>

      {/* Doc sources table */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">
            Doc Sources ({docs.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Source</TableHead>
                <TableHead className="text-zinc-400">Type</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-zinc-400">Chunks</TableHead>
                <TableHead className="text-zinc-400">Last Synced</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((doc) => (
                <TableRow key={doc.id} className="border-zinc-800 hover:bg-zinc-800/50">
                  <TableCell className="text-xs text-zinc-300 max-w-xs">
                    <div className="truncate" title={doc.source_path}>
                      {doc.title ?? doc.source_path}
                    </div>
                    {doc.title && doc.title !== doc.source_path && (
                      <div className="text-zinc-600 truncate text-[10px]">{doc.source_path}</div>
                    )}
                    {doc.error_message && (
                      <p className="text-red-400 mt-0.5 text-xs truncate">{doc.error_message}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs px-2 py-0.5 rounded border bg-zinc-800 text-zinc-400 border-zinc-700">
                      {TYPE_ICONS[doc.source_type] ?? ""} {doc.source_type}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`text-xs px-2 py-0.5 rounded border ${STATUS_COLORS[doc.status] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"}`}
                    >
                      {doc.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-zinc-400">
                    {doc.content_count}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500">
                    {doc.last_sync_at
                      ? new Date(doc.last_sync_at).toLocaleString()
                      : "\u2014"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      {doc.status === "ready" && (
                        <ContentPreview slug={slug} sourceId={doc.id} />
                      )}
                      <DocActions
                        slug={slug}
                        sourceId={doc.id}
                        sourceType={doc.source_type}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {docs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-zinc-500 text-sm text-center py-8">
                    No documents yet. Add a URL or upload a file below.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add sources */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-300">Add URL</h2>
          <AddUrlForm slug={slug} />
        </div>
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-300">Upload File</h2>
          <FileUploadForm slug={slug} />
        </div>
      </div>

      {/* Integrations */}
      <IntegrationsPanel slug={slug} />
    </div>
  );
}
