import {
  LayoutDashboard, Target, CalendarDays, CalendarRange, Users, FolderKanban,
  UserCog, Building2, MessageSquareText, ClipboardCheck, Megaphone, FileText,
  Upload, BarChart3, BellRing, ShieldCheck, Settings, History, KeyRound, Database, Bell, PhoneCall,
  CalendarSearch, Banknote, Clock, ClipboardList, UsersRound, Palette, Timer, Goal, ClipboardPen, Gauge, ListFilter,
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
// A lead sheet: staff, and a client for the names on their own projects (Row Level Security keeps the rest from them; Sean, Oct 2026).
const DETAIL_ROLES = [
  [/^\/leads\/\d+$/, [...STAFF, "client"]],
  // X-Dates by Month, opened from a client's own project (its month bars; Sean, Oct 2026): their projects only.
  [/^\/reports\/x-dates$/, ["admin", "client"]],
];

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
      // A client's own profile sheet for each project, to keep up to date (staff read it on the lead sheet).
      { href: "/project-info", label: "Project Info", icon: ClipboardList, roles: ["client"] },
    ],
  },
  {
    label: "Accounts",
    items: [
      // Administrators only (Sean, Oct 2026): a manager works their call lists from My Projects.
      { href: "/clients", label: "Clients", icon: Users, roles: ["admin"] },
      // A client's people see their own projects (Sean, Oct 2026), without what is ours to see or change.
      { href: "/projects", label: "Projects", icon: FolderKanban, roles: ["admin", "client"] },
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
      // The staff with their photos, as the old Meet DCM (a client's own people first).
      { href: "/team", label: "Meet the Team", icon: UsersRound, roles: ALL },
      // A client's logo and website, shown in their workspace.
      { href: "/branding", label: "Branding", icon: Palette, roles: ["client"] },
    ],
  },
  {
    label: "Data & Insights",
    items: [
      // Query the whole book at once: industry, ZIPs, renewal month, client…
      { href: "/explore", label: "Lead Explorer", icon: Database, roles: ["admin", "manager"] },
      // The businesses a client (or prospect) wants to target: industries, size, territory (Sean, Oct 2026).
      { href: "/list-builder", label: "List Builder", icon: ListFilter, roles: ["admin", "manager", "client"] },
      { href: "/imports", label: "Imports", icon: Upload, roles: ["admin"] },
      // Agents get the same page scoped to their own productivity.
      { href: "/reports", label: "Reports", icon: BarChart3, roles: ["admin", "agent", "client"] },
      // Renewal months across the book, a client or a project; each number opens its names.
      { href: "/reports/x-dates", label: "X-Dates by Month", icon: CalendarSearch, roles: ["admin"] },
      // Calls and paid events per day; everyone but an administrator sees only their own.
      { href: "/reports/production", label: "Production & Pay", icon: Banknote, roles: ["admin", "manager", "agent"] },
      // Time worked in the app, hourly vs commission per pay period; everyone but an administrator sees their own.
      { href: "/reports/pay", label: "Pay & Hours", icon: Clock, roles: ["admin", "manager", "agent"] },
      // One person's day by the hour: calls, leads and appointments; agents see their own.
      { href: "/reports/hourly", label: "Hourly Progress", icon: Timer, roles: ["admin", "manager", "agent"] },
      // A manager's Pipeline Report (Sean, Oct 2026): their projects' renewals by manager, as on X-Dates by Month.
      { href: "/reports/pipeline", label: "Pipeline Report", icon: Gauge, roles: ["manager"] },
      // Each project against its lead and appointment goals: owed, ahead, days to go.
      { href: "/reports/goals", label: "Project Goals", icon: Goal, roles: ["admin", "manager"] },
      // Every update clients make to their appointments, as they come in.
      { href: "/reports/appointment-updates", label: "Appointment Updates", icon: ClipboardPen, roles: ["admin"] },
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
