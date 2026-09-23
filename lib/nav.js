import {
  LayoutDashboard, Target, CalendarDays, CalendarRange, Users, FolderKanban,
  UserCog, Building2, MessageSquareText, ClipboardCheck, Megaphone, FileText,
  Upload, BarChart3, BellRing, ShieldCheck, Settings, History, KeyRound,
} from "lucide-react";

export const ROLES = {
  admin: { label: "Administrator" },
  manager: { label: "Account Manager" },
  agent: { label: "Agent" },
  client: { label: "Client" },
};

const ALL = ["admin", "manager", "agent", "client"];

/**
 * Which roles may open a path. Detail pages inherit from their section, so
 * /leads/12 follows /leads. Paths not listed here (the dashboard, the login
 * screen) are open to anyone signed in.
 */
export function rolesForPath(pathname) {
  const item = navGroups
    .flatMap((g) => g.items)
    .filter((i) => i.href !== "/")
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  return item?.roles ?? null;
}

export const navGroups = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ALL },
      { href: "/leads", label: "Leads", icon: Target, roles: ["admin", "agent"] },
      { href: "/appointments", label: "Appointments", icon: CalendarDays, roles: ALL },
      { href: "/calendar", label: "Calendar", icon: CalendarRange, roles: ALL },
    ],
  },
  {
    label: "Accounts",
    items: [
      { href: "/clients", label: "Clients", icon: Users, roles: ["admin", "manager"] },
      { href: "/projects", label: "Projects", icon: FolderKanban, roles: ["admin", "manager"] },
      { href: "/account-managers", label: "Account Managers", icon: UserCog, roles: ["admin"] },
      { href: "/insurance-companies", label: "Insurance Cos.", icon: Building2, roles: ["admin"] },
    ],
  },
  {
    label: "Engagement",
    items: [
      { href: "/feedback", label: "Client Feedback", icon: MessageSquareText, roles: ["admin", "client"] },
      { href: "/qa", label: "Quality QA", icon: ClipboardCheck, roles: ["admin", "agent"] },
      { href: "/bulletin", label: "Bulletin Board", icon: Megaphone, roles: ["admin", "manager", "agent"] },
      { href: "/documents", label: "Documents", icon: FileText, roles: ALL },
    ],
  },
  {
    label: "Data & Insights",
    items: [
      { href: "/imports", label: "Imports", icon: Upload, roles: ["admin"] },
      { href: "/reports", label: "Reports", icon: BarChart3, roles: ["admin", "manager", "client"] },
      { href: "/alerts", label: "Alert Engine", icon: BellRing, roles: ["admin"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/users", label: "Users & Access", icon: ShieldCheck, roles: ["admin"] },
      { href: "/activity", label: "Activity Log", icon: History, roles: ["admin"] },
      { href: "/security", label: "My Security", icon: KeyRound, roles: ALL },
      { href: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
    ],
  },
];
