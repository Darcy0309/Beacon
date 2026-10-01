/**
 * Display formatting shared by the server (view models) and the browser.
 * Pure functions: no data access, safe to import anywhere.
 */

const PALETTE = ["#2b6cb0", "#2c9d78", "#b7791f", "#6d47c9", "#c1362c", "#3f74e6", "#0e7490", "#7c53d6"];

/** A tel: link a softphone can dial: digits only, with the US country code. Null when there is no number. */
export function telHref(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  return digits ? `tel:${digits}` : null;
}

/** Stable colour for a name, so a record always looks the same. */
export function colorFor(name = "") {
  let h = 0;
  for (let i = 0; i < String(name).length; i++) h = (h * 31 + String(name).charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** "Garry Insurance" -> "GI" */
export function initialsOf(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const fullName = (u) =>
  u ? [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email || "" : "";

/** "Sean Fitzgerald" -> "Sean F." — how reps are labelled throughout the UI. */
export const shortName = (u) => {
  if (!u) return "Unassigned";
  if (u.first_name && u.last_name) return `${u.first_name} ${u.last_name[0]}.`;
  return fullName(u) || "Unassigned";
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** 2026-10-14 -> "Oct 14" */
export const shortDate = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, "0")}`;
};

/** 2026-09-25 -> "Friday, September 25" */
export const longDate = (v) => {
  if (!v) return "—";
  const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
};

/** "Aug 15, 2:14 PM" */
export const dateTime = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${time}`;
};

export const timeAgo = (v) => {
  if (!v) return "—";
  const t = new Date(v).getTime();
  if (Number.isNaN(t)) return "—";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return mins < 1 ? "just now" : `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return shortDate(v);
};

export const fileSize = (b) => {
  if (b == null) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

export const cityState = (r) => [r?.city, r?.state].filter(Boolean).join(", ") || "—";

/** "9:30 AM" -> { time: "9:30", ampm: "AM" } */
export const splitTime = (v) => {
  const m = String(v ?? "").match(/^(\d{1,2}:\d{2})\s*(AM|PM)?$/i);
  return m ? { time: m[1], ampm: (m[2] || "").toUpperCase() } : { time: String(v ?? "—"), ampm: "" };
};

export const isoDay = (d) => d.toISOString().slice(0, 10);

/** "9:30 AM" -> 570 (minutes past midnight) so appointments sort chronologically. */
export function timeRank(v) {
  const m = String(v ?? "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return 24 * 60 + 1;
  let h = Number(m[1]) % 12;
  if ((m[3] || "").toUpperCase() === "PM") h += 12;
  return h * 60 + Number(m[2]);
}

/** "Garry Insurance" -> "garry-insurance", the client's address in /clients/[slug]. */
export const clientSlug = (name) =>
  String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** 2027-03-15 -> "Mar 15, 2027" (renewals, where the year matters) */
export const mediumDate = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
};
