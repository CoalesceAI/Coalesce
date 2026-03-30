"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { useOrg } from "@/lib/org-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { OrgGeneralSettings } from "./general-settings";
import { OrgApiKeys } from "./api-keys-section";
import { OrgTeamMembers } from "./team-members";
import { IntegrationSnippet } from "./integration-snippet";
import { CreateOrgForm } from "./create-org-form";
import { Settings2, Key, Users, Code2 } from "lucide-react";

const SECTIONS = [
  { id: "general", label: "General", Icon: Settings2 },
  { id: "keys", label: "API Keys", Icon: Key },
  { id: "team", label: "Team", Icon: Users },
  { id: "integrate", label: "Integrate", Icon: Code2 },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function SettingsContent() {
  const { currentOrg, loading, error, refreshOrgs } = useOrg();
  const searchParams = useSearchParams();
  const router = useRouter();

  const section = (searchParams.get("section") as SectionId | null) ?? "general";
  const activeSection = SECTIONS.find((s) => s.id === section) ? section : "general";

  function setSection(id: SectionId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", id);
    router.push(`/settings?${params.toString()}`);
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-5xl">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-8 mt-8">
          <div className="w-44 space-y-1">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
          <Skeleton className="flex-1 h-64" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
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
      <div className="space-y-8 max-w-lg">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Create Your Organization</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Get started by creating your first organization.
          </p>
        </div>
        <CreateOrgForm />
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{currentOrg.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Organization settings
        </p>
      </div>

      <Separator />

      {/* Two-column layout */}
      <div className="flex gap-8">
        {/* Left nav */}
        <nav className="w-44 shrink-0 space-y-0.5">
          {SECTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors text-left",
                activeSection === id
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* Right pane */}
        <div className="flex-1 min-w-0">
          {activeSection === "general" && <OrgGeneralSettings org={currentOrg} />}
          {activeSection === "keys" && <OrgApiKeys slug={currentOrg.slug} />}
          {activeSection === "team" && (
            <OrgTeamMembers slug={currentOrg.slug} role={currentOrg.role} />
          )}
          {activeSection === "integrate" && (
            <IntegrationSnippet slug={currentOrg.slug} orgName={currentOrg.name} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 max-w-5xl">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
