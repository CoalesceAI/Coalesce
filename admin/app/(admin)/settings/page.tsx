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
import { CreateOrgForm } from "./create-org-form";

interface Org {
  id: string;
  slug: string;
  name: string;
  created_at: string;
  deleted_at: string | null;
}

export default async function SettingsPage() {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return null;

  const orgs = await adminFetch<Org[]>("/admin/orgs", {}, token);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-zinc-100">Settings</h1>

      <div className="grid grid-cols-3 gap-8">
        <div className="col-span-2 space-y-4">
          <h2 className="text-sm font-medium text-zinc-300">Organizations</h2>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-zinc-400">Slug</TableHead>
                    <TableHead className="text-zinc-400">Name</TableHead>
                    <TableHead className="text-zinc-400">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgs.map((org) => (
                    <TableRow
                      key={org.id}
                      className="border-zinc-800 hover:bg-zinc-800/50"
                    >
                      <TableCell>
                        <Link
                          href={`/settings/${org.slug}`}
                          className="text-blue-400 hover:underline text-sm font-mono"
                        >
                          {org.slug}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-zinc-300">
                        {org.name}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500">
                        {new Date(org.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {orgs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-zinc-500 text-sm text-center py-8">
                        No organizations yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-medium text-zinc-300">New Organization</h2>
          <CreateOrgForm />
        </div>
      </div>
    </div>
  );
}
