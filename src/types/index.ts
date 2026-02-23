export interface NavItem {
  title: string;
  url: string;
  icon: string;
  isActive?: boolean;
  shortcut?: string[];
  items?: Array<{
    title: string;
    url: string;
    icon: string;
    shortcut?: string[];
  }>;
}
