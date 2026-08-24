import {
  LayoutDashboard, Target, CalendarDays, CalendarRange, Users, FolderKanban,
  UserCog, Building2, MessageSquareText, ClipboardCheck, Megaphone, FileText,
  Upload, BarChart3, BellRing, ShieldCheck, Settings,
} from "lucide-react";

export const ROLES = {
  admin: { label: "Administrator" },
  manager: { label: "Account Manager" },
  agent: { label: "Agent" },
  client: { label: "Client" },
};

const ALL = ["admin", "manager", "agent", "client"];

export const navGroups = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ALL },
      { href: "/leads", label: "Leads", icon: Target, badge: "342", roles: ["admin", "manager", "agent"] },
      { href: "/appointments", label: "Appointments", icon: CalendarDays, roles: ALL },
      { href: "/calendar", label: "Calendar", icon: CalendarRange, roles: ALL },
    ],
  },
  {
    label: "Accounts",
    items: [
      { href: "/clients", label: "Clients", icon: Users, roles: ["admin", "manager"] },
      { href: "/projects", label: "Projects", icon: FolderKanban, roles: ["admin", "manager"] },
      { href: "/account-managers", label: "Account Managers", icon: UserCog, roles: ["admin", "manager"] },
      { href: "/insurance-companies", label: "Insurance Cos.", icon: Building2, roles: ["admin", "manager"] },
    ],
  },
  {
    label: "Engagement",
    items: [
      { href: "/feedback", label: "Client Feedback", icon: MessageSquareText, roles: ["admin", "manager", "client"] },
      { href: "/qa", label: "Quality QA", icon: ClipboardCheck, roles: ["admin", "manager", "agent"] },
      { href: "/bulletin", label: "Bulletin Board", icon: Megaphone, roles: ["admin", "manager", "agent"] },
      { href: "/documents", label: "Documents", icon: FileText, roles: ALL },
    ],
  },
  {
    label: "Data & Insights",
    items: [
      { href: "/imports", label: "Imports", icon: Upload, roles: ["admin", "manager"] },
      { href: "/reports", label: "Reports", icon: BarChart3, roles: ["admin", "manager", "client"] },
      { href: "/alerts", label: "Alert Engine", icon: BellRing, roles: ["admin", "manager"] },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/users", label: "Users & Access", icon: ShieldCheck, roles: ["admin"] },
      { href: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
    ],
  },
];
