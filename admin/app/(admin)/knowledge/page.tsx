"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOrg } from "@/lib/org-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function KnowledgePage() {
  const router = useRouter();
  const { currentOrg, loading, error, refreshOrgs } = useOrg();

  useEffect(() => {
    if (loading || error || !currentOrg) return;
    router.replace(`/knowledge/${currentOrg.slug}`);
  }, [loading, error, currentOrg, router]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge Base</h1>
        <Alert variant="destructive">
          <AlertTitle>Could not load organizations</AlertTitle>
          <AlertDescription className="mt-1 whitespace-pre-wrap">{error}</AlertDescription>
        </Alert>
        <Button type="button" variant="secondary" size="sm" onClick={() => refreshOrgs()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!currentOrg) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge Base</h1>
        <p className="text-sm text-muted-foreground">
          Create an organization in{" "}
          <Link href="/settings" className="text-primary hover:underline">
            Settings
          </Link>{" "}
          to manage its knowledge base.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <p className="text-sm text-muted-foreground">Opening knowledge base…</p>
    </div>
  );
}
