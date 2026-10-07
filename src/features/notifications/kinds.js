import {
  AlarmClock, Bell, MessageSquare, CalendarCheck, Target, Star, Upload, Megaphone,
} from "lucide-react";

/** How each kind of notification is drawn, and what it is called on its own page. */
export const KIND_ICONS = {
  message: MessageSquare,
  appointment: CalendarCheck,
  lead: Target,
  feedback: Star,
  import: Upload,
  bulletin: Megaphone,
  system: Bell,
  reminder: AlarmClock,
};

export const KIND_LABELS = {
  message: "Direct message",
  appointment: "Appointment",
  lead: "Lead",
  feedback: "Client feedback",
  import: "Import",
  bulletin: "Announcement",
  system: "Account notice",
  reminder: "Call-back reminder",
};

export const ROLE_LABELS = { admin: "Administrator", manager: "Account manager", agent: "Agent", client: "Client" };

/** The page a notification points at, for its "Open …" button. */
const LINK_LABELS = {
  calendar: "Open calendar",
  appointments: "Open appointments",
  leads: "Open leads",
  projects: "Open project",
  clients: "Open client",
  feedback: "Open feedback",
  imports: "Open imports",
  bulletin: "Open bulletin board",
  users: "Open user",
  documents: "Open documents",
};

export function linkLabel(link) {
  const path = String(link ?? "").split(/[?#]/)[0];
  const [, section, id] = path.split("/");
  if (section === "leads" && id) return "Open lead";
  return LINK_LABELS[section] ?? "Open";
}
