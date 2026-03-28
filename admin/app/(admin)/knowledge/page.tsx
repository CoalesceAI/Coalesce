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
      <h1 className="text-2xl font-semibold text-zinc-100">Knowledge Base</h1>
      <p className="text-sm text-zinc-500">
        Select an organization to manage its knowledge base.
      </p>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Organization</TableHead>
                <TableHead className="text-zinc-400">Slug</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((org) => (
                <TableRow key={org.id} className="border-zinc-800 hover:bg-zinc-800/50">
                  <TableCell>
                    <Link
                      href={`/knowledge/${org.slug}`}
                      className="text-blue-400 hover:underline text-sm"
                    >
                      {org.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-zinc-400">
                    {org.slug}
                  </TableCell>
                </TableRow>
              ))}
              {orgs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-zinc-500 text-sm text-center py-8">
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
