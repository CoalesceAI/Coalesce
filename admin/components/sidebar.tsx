"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  BarChart2,
  MessageSquare,
  BookOpen,
  Settings,
  ChevronsUpDown,
  Plus,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrg } from "@/lib/org-context";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { href: "/dashboard", label: "Dashboard", Icon: BarChart2 },
  { href: "/sessions", label: "Sessions", Icon: MessageSquare },
  { href: "/knowledge", label: "Knowledge Base", Icon: BookOpen },
  { href: "/settings", label: "Settings", Icon: Settings },
] as const;

function OrgAvatar({ name, className }: { name: string; className?: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground text-xs font-semibold",
        "group-data-[collapsible=icon]:h-6 group-data-[collapsible=icon]:w-6 group-data-[collapsible=icon]:text-[10px]",
        className,
      )}
    >
      {initial}
    </div>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentOrg, userOrgs, switchOrg } = useOrg();

  function handleSwitchOrg(slug: string) {
    switchOrg(slug);
    // Knowledge base URL is scoped by org slug — keep it in sync when switching
    if (pathname.startsWith("/knowledge/") && pathname !== "/knowledge") {
      const segment = pathname.slice("/knowledge/".length).split("/")[0];
      if (segment && segment !== slug) {
        router.replace(`/knowledge/${slug}`);
      }
    }
  }

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring">
                {currentOrg ? (
                  <>
                    <OrgAvatar name={currentOrg.name} />
                    <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                      <span className="truncate font-semibold text-sidebar-foreground">
                        {currentOrg.name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        Free Tier
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50 group-data-[collapsible=icon]:hidden" />
                  </>
                ) : (
                  <>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground text-xs font-semibold group-data-[collapsible=icon]:h-6 group-data-[collapsible=icon]:w-6">
                      ?
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                      <span className="truncate font-semibold text-muted-foreground">
                        No Organization
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        Create one to get started
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50 group-data-[collapsible=icon]:hidden" />
                  </>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-64"
                align="start"
                side="bottom"
                sideOffset={4}
              >
                {/* GroupLabel must live inside Menu.Group (Base UI) */}
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    {userOrgs.length > 1
                      ? "Switch organization"
                      : "Organization"}
                  </DropdownMenuLabel>
                  {userOrgs.length > 0 ? (
                    userOrgs.map((org) => (
                      <DropdownMenuItem
                        key={org.slug}
                        onClick={() => handleSwitchOrg(org.slug)}
                        className="gap-2 p-2"
                      >
                        <OrgAvatar
                          name={org.name}
                          className="h-6 w-6 text-[10px]"
                        />
                        <span className="truncate text-sm">{org.name}</span>
                        {currentOrg?.slug === org.slug && (
                          <Check className="ml-auto h-4 w-4 shrink-0 opacity-80" />
                        )}
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <DropdownMenuItem
                      onClick={() => {
                        window.location.href = "/settings";
                      }}
                      className="gap-2 p-2"
                    >
                      <Plus className="h-4 w-4 opacity-60" />
                      <span className="text-sm">Set up in Settings</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    window.location.href = "/settings";
                  }}
                  className="gap-2 p-2"
                >
                  <Settings className="h-4 w-4 opacity-60" />
                  <span className="text-sm">Organization settings</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map(({ href, label, Icon }) => {
                const active = pathname.startsWith(href);
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      render={<Link href={href} />}
                      isActive={active}
                      tooltip={label}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4",
                          active ? "text-sidebar-primary" : "opacity-60",
                        )}
                        strokeWidth={1.75}
                      />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="px-2 py-2">
              <UserButton />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
