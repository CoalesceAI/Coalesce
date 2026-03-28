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
      <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>

      <div className="grid grid-cols-3 gap-8">
        <div className="col-span-2 space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">All Organizations</h2>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Slug</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgs.map((org) => (
                    <TableRow key={org.id}>
                      <TableCell>
                        <Link
                          href={`/settings/${org.slug}`}
                          className="text-primary hover:underline text-sm font-mono"
                        >
                          {org.slug}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {org.name}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(org.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {orgs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground text-sm text-center py-8">
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
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">New Organization</h2>
          <CreateOrgForm />
        </div>
      </div>
    </div>
  );
}
