// Settings by area (client, Nov 2026: "a large number of items are listed in the settings; it would be better to
// categorize them by area … view these categories and click on them to access more detailed settings"). Each area's
// address, name, what it holds (`items`, on the tile; `details`, shown when the tile is pointed at), and the icon it
// shows.

export const SETTINGS_AREAS = [
  { key: "general", title: "Company & Sign-in", icon: "building",
    details: "Your company's name and logo, the address emails go out from, two-factor and password rules, and when an idle session signs out.",
    items: ["Branding", "Email server", "Sign-in security", "Idle sign-out"] },
  { key: "dashboard", title: "Dashboard", icon: "layout",
    details: "Choose which sections show, collapse or move them, and set the layout each role starts from.",
    items: ["Dashboard layout", "Role defaults"] },
  { key: "phone", title: "Phone", icon: "phone",
    details: "Your Twilio lines and caller IDs, each manager's extension, the voicemail greeting, and recording every call.",
    items: ["Phone lines", "Extensions & voicemail", "Call recording"] },
  { key: "messages", title: "Email & Texts", icon: "mail",
    details: "The templates managers email from, how and when leads and appointments go to clients, and the reminder text the day before.",
    items: ["Email templates", "Lead delivery", "Appointment texts"] },
  { key: "pay", title: "Pay & Time", icon: "pay",
    details: "Lead and appointment pay ranges, how time worked is counted, the pay periods, and the managers' bonus plans.",
    items: ["Pay rates", "Time worked", "Pay schedule", "Bonus plans"] },
  { key: "leads", title: "Leads & Lists", icon: "list",
    details: "Lead sheets for other industries, the SIC code list, and the cargo types a lead can carry.",
    items: ["Campaign types", "SIC codes", "Cargo types"] },
  { key: "trash", title: "Deleted Records", icon: "trash",
    details: "Clients, projects and leads that were deleted: put one back, or remove it for good.",
    items: ["Deleted records"] },
];

export const settingsArea = (key) => SETTINGS_AREAS.find((a) => a.key === key) ?? null;
