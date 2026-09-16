// Presentation helpers. The sample data used to carry baked-in avatar colours
// and initials; with real records these are derived from the row instead.

const PALETTE = [
  "#2b6cb0", "#2c9d78", "#b7791f", "#6d47c9",
  "#c1362c", "#3f74e6", "#0e7490", "#7c53d6",
];

/** Stable colour for a name, so the same record always looks the same. */
export function colorFor(name = "") {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** "Garry Insurance" -> "GI"; "Sean" -> "SE" */
export function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function fullName(user) {
  if (!user) return "Unassigned";
  const n = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return n || user.email || "Unassigned";
}

/** "Sean Fitzgerald" -> "Sean F." (how reps are shown in lists) */
export function shortName(user) {
  if (!user) return "Unassigned";
  const first = user.first_name;
  const last = user.last_name;
  if (first && last) return `${first} ${last[0]}.`;
  return fullName(user);
}

export function cityState(row) {
  if (!row) return "—";
  return [row.city, row.state].filter(Boolean).join(", ") || "—";
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** 2026-10-14 -> "Oct 14" */
export function shortDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** 2026-10-14 -> "Oct 14, 2026" */
export function longDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** Relative age, e.g. "3h ago", "2d ago". */
export function timeAgo(value) {
  if (!value) return "—";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "—";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

export function fileSize(bytes) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "9:30 AM" -> { time: "9:30", ampm: "AM" } for the split appointment display. */
export function splitTime(value) {
  if (!value) return { time: "—", ampm: "" };
  const m = String(value).match(/^(\d{1,2}:\d{2})\s*(AM|PM)?$/i);
  if (!m) return { time: String(value), ampm: "" };
  return { time: m[1], ampm: (m[2] || "").toUpperCase() };
}

export const slugify = (name = "") =>
  String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
