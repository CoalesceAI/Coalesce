import { NavItem } from "@/types";

export const navItems: NavItem[] = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: "dashboard",
    isActive: false,
    shortcut: ["d", "d"],
    items: [],
  },
  {
    title: "Markets",
    url: "/markets",
    icon: "barChart",
    shortcut: ["m", "m"],
    isActive: false,
    items: [],
  },
  {
    title: "Arbitrage",
    url: "/arbitrage",
    icon: "arrowLeftRight",
    shortcut: ["a", "a"],
    isActive: false,
    items: [],
  },
  {
    title: "Settings",
    url: "#",
    icon: "settings",
    isActive: false,
    items: [
      {
        title: "Team",
        url: "/settings/team",
        icon: "users",
        shortcut: ["s", "t"],
      },
      {
        title: "Developers",
        url: "/settings/developers",
        icon: "code",
        shortcut: ["s", "d"],
      },
    ],
  },
];
