/**
 * Display formatting shared by the server (view models) and the browser.
 * Pure functions: no data access, safe to import anywhere.
 */

const PALETTE = ["#2b6cb0", "#2c9d78", "#b7791f", "#6d47c9", "#c1362c", "#3f74e6", "#0e7490", "#7c53d6"];

/** An extension at the end of a number: "x203", "ext. 203", "extension 203", "#203". */
export const PHONE_EXTENSION = /\s*(?:x|ext\.?|extension|#)\s*(\d{1,6})\s*$/i;

/**
 * A tel: link a softphone can dial: digits only, with the US country code,
 * and an extension after a pause (",203"), which the dialer sends once the
 * call connects. Null when there is no number.
 */
export function telHref(phone) {
  const text = String(phone ?? "");
  const ext = text.match(PHONE_EXTENSION)?.[1];
  const digits = text.replace(PHONE_EXTENSION, "").replace(/\D/g, "");
  const number = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : digits;
  return number ? `tel:${number}${ext ? `,${ext}` : ""}` : null;
}

/**
 * A phone number as it is kept (Sean, Oct 2026): "602-555-0100", with an
 * extension as "602-555-0100 x203", however it was typed ("(602) 555-0100",
 * "6025550100", "+1 602.555.0100"). Null when it is not ten digits (the US
 * country code aside) or carries anything else ("602-555-0100 cell").
 */
export function formatPhone(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const ext = text.match(PHONE_EXTENSION)?.[1];
  const main = text.replace(PHONE_EXTENSION, "");
  if (!/^[+\d\s().-]+$/.test(main)) return null;
  let d = main.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10) return null;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}${ext ? ` x${ext}` : ""}`;
}

/**
 * A phone number as it is being typed: digits grouped 602-555-0100 as they
 * come, anything else dropped (a "cell" typed after it), and an extension
 * once the number is whole ("x", "ext", then up to six digits).
 */
export function typePhone(value) {
  const text = String(value ?? "");
  const m = /(?:x|ext\.?|extension|#)\s*(\d*)\s*$/i.exec(text);
  let d = (m ? text.slice(0, m.index) : text).replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  d = d.slice(0, 10);
  const main = d.length <= 3 ? d : d.length <= 6 ? `${d.slice(0, 3)}-${d.slice(3)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return m && d.length === 10 ? `${main} x${m[1].slice(0, 6)}` : main;
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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/**
 * An appointment's day with its weekday, and its time when it has one:
 * "Thu, 10/22/2026 11:00 AM" (Sean, Oct 2026: the day of the week at a glance).
 * `date` "YYYY-MM-DD…"; "—" without one.
 */
export const apptWhen = (date, time = null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? ""));
  if (!m) return "—";
  const day = WEEKDAYS[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
  return `${day}, ${m[2]}/${m[3]}/${m[1]}${time ? ` ${time}` : ""}`;
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

/** An SIC code with what it means: "1731 – Electrical Work" (just the code when it is not on the list). */
export const sicLabel = (code, description) =>
  code ? (description ? `${code} – ${description}` : String(code)) : null;

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

/**
 * What kind of appointment it is, as its call result says (Sean, Oct 2026):
 * Appointment, Appointment-Phone or Appointment-Confirmed, from the lead's
 * result while that is one of them; else by whether it was confirmed.
 */
export const appointmentKind = (resultName, confirmed = false) =>
  /^Appointment(-Phone|-Confirmed)?$/i.test(String(resultName ?? "").trim()) ? String(resultName).trim() : confirmed ? "Appointment-Confirmed" : "Appointment";
