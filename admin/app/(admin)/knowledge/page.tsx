import { auth } from "@clerk/nextjs/server";
import { adminFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";

interface Org {
  id: string;
  slug: string;
  name: string;
}

export default async function KnowledgePage() {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return null;

  const orgs = await adminFetch<Org[]>("/admin/orgs", {}, token);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Knowledge Base</h1>
      <p className="text-sm text-muted-foreground">
        Select an organization to manage its knowledge base.
      </p>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Organization</TableHead>
                <TableHead>Slug</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((org) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <Link
                      href={`/knowledge/${org.slug}`}
                      className="text-primary hover:underline text-sm font-medium"
                    >
                      {org.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {org.slug}
                  </TableCell>
                </TableRow>
              ))}
              {orgs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-muted-foreground text-sm text-center py-8">
                    No organizations. Create one in Settings first.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
