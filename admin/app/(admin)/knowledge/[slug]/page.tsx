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
import { Badge } from "@/components/ui/badge";
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

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  ready: "default",
  crawling: "outline",
  processing: "outline",
  pending: "secondary",
  error: "destructive",
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
        <Link href="/knowledge" className="text-muted-foreground hover:text-foreground text-sm">
          &larr; Knowledge Base
        </Link>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">
        {slug} &mdash; Knowledge Base
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Doc Sources ({docs.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Source</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Chunks</TableHead>
                <TableHead>Last Synced</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="text-xs max-w-xs">
                    <div className="truncate" title={doc.source_path}>
                      {doc.title ?? doc.source_path}
                    </div>
                    {doc.title && doc.title !== doc.source_path && (
                      <div className="text-muted-foreground/60 truncate text-[10px]">{doc.source_path}</div>
                    )}
                    {doc.error_message && (
                      <p className="text-destructive mt-0.5 text-xs truncate">{doc.error_message}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {TYPE_ICONS[doc.source_type] ?? ""} {doc.source_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[doc.status] ?? "secondary"} className="text-xs">
                      {doc.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {doc.content_count}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
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
                  <TableCell colSpan={6} className="text-muted-foreground text-sm text-center py-8">
                    No documents yet. Add a URL or upload a file below.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-foreground">Add URL</h2>
          <AddUrlForm slug={slug} />
        </div>
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-foreground">Upload File</h2>
          <FileUploadForm slug={slug} />
        </div>
      </div>

      <IntegrationsPanel slug={slug} />
    </div>
  );
}
