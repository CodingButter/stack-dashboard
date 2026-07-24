import {
  Activity,
  Bell,
  Clapperboard,
  Download,
  HardDrive,
  LayoutDashboard,
  Palette,
  ScrollText,
  Server,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { title: "Overview", href: "/", icon: LayoutDashboard },
  { title: "Storage", href: "/storage", icon: HardDrive },
  { title: "Plex", href: "/plex", icon: Clapperboard },
  { title: "Downloads", href: "/downloads", icon: Download },
  { title: "Tdarr", href: "/tdarr", icon: Activity },
  { title: "Machines", href: "/machines", icon: Server },
  { title: "Logs", href: "/logs", icon: ScrollText },
  { title: "Alerts", href: "/alerts", icon: Bell },
  { title: "Settings", href: "/settings", icon: Settings },
  { title: "Design gallery", href: "/design", icon: Palette },
];
