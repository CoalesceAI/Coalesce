import { Home, Settings, Command, Ticket, Zap } from "lucide-react";
import { useTeam } from "@/app/providers/team-provider";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";

// Menu items.
const items = [
  {
    title: "Dashboard",
    url: (teamSlug: string) => `/${teamSlug}/dashboard`,
    icon: Home,
  },
  {
    title: "Tickets",
    url: (teamSlug: string) => `/${teamSlug}/tickets`,
    icon: Ticket,
  },
  {
    title: "Events",
    url: (teamSlug: string) => `/${teamSlug}/events`,
    icon: Zap,
  },
  {
    title: "Settings",
    url: (teamSlug: string) => `/${teamSlug}/settings`,
    icon: Settings,
  },
];

export function AppSidebar() {
  const { teamData } = useTeam();
  const { userData } = useTeam();
  const teamSlug = teamData?.slug || "";
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={`/${teamSlug}/dashboard`}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Command className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{`${teamData?.name}`}</span>
                  <span className="truncate text-xs">{`${teamData?.slug}`}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link href={teamSlug ? item.url(teamSlug) : "#"}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-3 rounded-md px-3 mb-2 text-muted-foreground transition-all">
              <UserButton />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-primary">
                  {userData?.name}
                </span>
                <span className="text-xs">{userData?.email}</span>
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
