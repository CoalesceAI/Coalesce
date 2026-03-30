import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { OrgProvider } from "@/lib/org-context";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OrgProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4 bg-background sticky top-0 z-10">
            <SidebarTrigger className="-ml-1" />
            <ThemeToggle />
          </header>
          <div className="p-6 md:p-8">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </OrgProvider>
  );
}
