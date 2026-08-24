import {
  LayoutDashboard, Target, CalendarDays, CalendarRange, Users, FolderKanban,
  UserCog, Building2, MessageSquareText, ClipboardCheck, Megaphone, FileText,
  Upload, BarChart3, BellRing, ShieldCheck, Settings,
} from "lucide-react";

export const navGroups = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/leads", label: "Leads", icon: Target, badge: "342" },
      { href: "/appointments", label: "Appointments", icon: CalendarDays },
      { href: "/calendar", label: "Calendar", icon: CalendarRange },
    ],
  },
  {
    label: "Accounts",
    items: [
      { href: "/clients", label: "Clients", icon: Users },
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/account-managers", label: "Account Managers", icon: UserCog },
      { href: "/insurance-companies", label: "Insurance Cos.", icon: Building2 },
    ],
  },
  {
    label: "Engagement",
    items: [
      { href: "/feedback", label: "Client Feedback", icon: MessageSquareText },
      { href: "/qa", label: "Quality QA", icon: ClipboardCheck },
      { href: "/bulletin", label: "Bulletin Board", icon: Megaphone },
      { href: "/documents", label: "Documents", icon: FileText },
    ],
  },
  {
    label: "Data & Insights",
    items: [
      { href: "/imports", label: "Imports", icon: Upload },
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/alerts", label: "Alert Engine", icon: BellRing },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/users", label: "Users & Access", icon: ShieldCheck },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];
