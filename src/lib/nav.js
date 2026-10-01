import {
  LayoutDashboard, Target, CalendarDays, CalendarRange, Users, FolderKanban,
  UserCog, Building2, MessageSquareText, ClipboardCheck, Megaphone, FileText,
  Upload, BarChart3, BellRing, ShieldCheck, Settings, History, KeyRound, Database, Bell, PhoneCall,
  CalendarSearch, Banknote,
} from "lucide-react";

export const ROLES = {
  admin: { label: "Administrator" },
  manager: { label: "Account Manager" },
  agent: { label: "Agent" },
  client: { label: "Client" },
};

const ALL = ["admin", "manager", "agent", "client"];

const STAFF = ["admin", "manager", "agent"];

// Pages open to more roles than the section they sit in. A lead sheet is
// where every call is worked, so anyone with a call list can open one; the
// full Leads list stays with administrators and agents.
const DETAIL_ROLES = [[/^\/leads\/\d+$/, STAFF]];

/**
 * Which roles may open a path. Detail pages inherit from their section, so
 * /projects/12 follows /projects, unless DETAIL_ROLES says otherwise. Paths
 * not listed here (the dashboard, the login screen) are open to anyone
 * signed in.
 */
export function rolesForPath(pathname) {
  const detail = DETAIL_ROLES.find(([re]) => re.test(pathname));
  if (detail) return detail[1];
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
      // The account manager's day: their projects, then each one's call list.
      { href: "/work", label: "My Projects", icon: PhoneCall, roles: STAFF },
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
      { href: "/notifications", label: "Notifications", icon: Bell, roles: ALL },
      { href: "/feedback", label: "Client Feedback", icon: MessageSquareText, roles: ["admin", "client"] },
      { href: "/qa", label: "Quality QA", icon: ClipboardCheck, roles: ["admin", "agent"] },
      { href: "/bulletin", label: "Bulletin Board", icon: Megaphone, roles: ["admin", "manager", "agent"] },
      { href: "/documents", label: "Documents", icon: FileText, roles: ALL },
    ],
  },
  {
    label: "Data & Insights",
    items: [
      // Query the whole book at once: industry, ZIPs, renewal month, client…
      { href: "/explore", label: "Lead Explorer", icon: Database, roles: ["admin", "manager"] },
      { href: "/imports", label: "Imports", icon: Upload, roles: ["admin"] },
      // Agents get the same page scoped to their own productivity.
      { href: "/reports", label: "Reports", icon: BarChart3, roles: ["admin", "manager", "agent", "client"] },
      // Renewal months across the book, a client or a project; each number opens its names.
      { href: "/reports/x-dates", label: "X-Dates by Month", icon: CalendarSearch, roles: ["admin", "manager"] },
      // Calls and paid events per day; everyone but an administrator sees only their own.
      { href: "/reports/production", label: "Production & Pay", icon: Banknote, roles: ["admin", "manager", "agent"] },
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
