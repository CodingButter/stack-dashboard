import {
  Activity,
  Bell,
  Clapperboard,
  Download,
  HardDrive,
  LayoutDashboard,
  ListChecks,
  Palette,
  Plug,
  ScrollText,
  Server,
  ShieldCheck,
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
  { title: "Streams", href: "/streams", icon: Clapperboard },
  { title: "Downloads", href: "/downloads", icon: Download },
  { title: "Arr", href: "/arr", icon: ListChecks },
  { title: "Tdarr", href: "/tdarr", icon: Activity },
  { title: "Machines", href: "/machines", icon: Server },
  { title: "Logs", href: "/logs", icon: ScrollText },
  { title: "Alerts", href: "/alerts", icon: Bell },
  { title: "Audit", href: "/audit", icon: ShieldCheck },
  { title: "Users", href: "/settings/users", icon: Settings },
  { title: "Services", href: "/settings/services", icon: Plug },
  { title: "Design gallery", href: "/design", icon: Palette },
];
