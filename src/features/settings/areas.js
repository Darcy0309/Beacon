// Settings by area (client, Nov 2026: "a large number of items are listed in the settings; it would be better to
// categorize them by area … view these categories and click on them to access more detailed settings"). Each area's
// address, name, what it holds (the tile's summary; `details`, more of it, shown when the tile is pointed at), and
// the icon it shows.

export const SETTINGS_AREAS = [
  { key: "general", title: "Company & Sign-in", icon: "building", summary: "Branding, the email server, sign-in security and idle sign-out",
    details: "Your company's name and logo, the address emails go out from, two-factor and password rules, and when an idle session signs out.",
    items: ["Branding", "Email server", "Sign-in security", "Idle sign-out"] },
  { key: "dashboard", title: "Dashboard", icon: "layout", summary: "The dashboard's sections, yours and each role's default",
    details: "Choose which sections show, collapse or move them, and set the layout each role starts from.",
    items: ["Dashboard layout", "Role defaults"] },
  { key: "phone", title: "Phone", icon: "phone", summary: "Lines, extensions, voicemail and call recording",
    details: "Your Twilio lines and caller IDs, each manager's extension, the voicemail greeting, and recording every call.",
    items: ["Phone lines", "Extensions & voicemail", "Call recording"] },
  { key: "messages", title: "Email & Texts", icon: "mail", summary: "Email templates, lead delivery to clients and appointment texts",
    details: "The templates managers email from, how and when leads and appointments go to clients, and the reminder text the day before.",
    items: ["Email templates", "Lead delivery", "Appointment texts"] },
  { key: "pay", title: "Pay & Time", icon: "pay", summary: "Pay rates, time worked, pay periods and bonus plans",
    details: "Lead and appointment pay ranges, how time worked is counted, the pay periods, and the managers' bonus plans.",
    items: ["Pay rates", "Time worked", "Pay schedule", "Bonus plans"] },
  { key: "leads", title: "Leads & Lists", icon: "list", summary: "Campaign types, SIC codes and cargo types",
    details: "Lead sheets for other industries, the SIC code list, and the cargo types a lead can carry.",
    items: ["Campaign types", "SIC codes", "Cargo types"] },
  { key: "trash", title: "Deleted Records", icon: "trash", summary: "What was deleted, to restore or remove for good",
    details: "Clients, projects and leads that were deleted: put one back, or remove it for good.",
    items: ["Deleted records"] },
];

export const settingsArea = (key) => SETTINGS_AREAS.find((a) => a.key === key) ?? null;
