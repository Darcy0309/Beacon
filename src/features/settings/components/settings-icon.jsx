import { Building2, LayoutDashboard, ListTree, Mail, Phone, Trash2, Wallet } from "lucide-react";

const ICONS = { building: Building2, layout: LayoutDashboard, phone: Phone, mail: Mail, pay: Wallet, list: ListTree, trash: Trash2 };

/** A settings area's icon (areas.js names it). */
export default function SettingsIcon({ name, className }) {
  const Icon = ICONS[name] ?? Building2;
  return <Icon className={className} aria-hidden />;
}
