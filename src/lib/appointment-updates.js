/**
 * How a client says an appointment went (Sean, Oct 2026): one of nine
 * statuses, a note, a potential premium while quoting, and for a sold account
 * the premium and carrier on each policy line. The database keeps the same
 * keys (update_appointment_status()); with none given an appointment shows
 * Pending Appointment until its time, then No Status.
 */

/** [key, label, color], in the order offered. */
export const UPDATE_STATUSES = [
  ["no_status", "No Status", "var(--neon-amber)"],
  ["valid", "Valid Appointment", "var(--neon-cyan)"],
  ["valid_quoting", "Valid-Quoting", "var(--neon-blue)"],
  ["valid_not_quoting", "Valid-Not Quoting", "var(--neon-violet)"],
  ["quoted_not_sold", "Quoted-Not Sold", "var(--neon-magenta)"],
  ["sold", "Sold Account", "var(--neon-emerald)"],
  ["invalid", "Invalid", "var(--neon-rose)"],
  ["reschedule", "Please Reschedule", "var(--neon-amber)"],
  ["pending_appointment", "Pending Appointment", "var(--muted-foreground)"],
];
export const STATUS_KEYS = UPDATE_STATUSES.map(([k]) => k);
const BY_KEY = Object.fromEntries(UPDATE_STATUSES.map(([k, label, color]) => [k, { label, color }]));
export const statusLabel = (key) => BY_KEY[key]?.label ?? key ?? "—";
export const statusColor = (key) => BY_KEY[key]?.color ?? "var(--muted-foreground)";

/** The policy lines of a sold account: [key, label]. */
export const SOLD_LINES = [
  ["liability", "Liability"], ["work_comp", "Work Comp"], ["auto", "Auto"], ["umbrella", "Umbrella"],
  ["eo", "E&O"], ["personal", "Personal Home/Auto"], ["health", "Health"],
];
export const lineLabel = (key) => SOLD_LINES.find(([k]) => k === key)?.[1] ?? key;

/** "$1,234" or "$1,234.50": an amount as money. */
export const money = (n) => (n == null || n === "" ? "—"
  : Number(n).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 }));

/** An amount typed in a box ("$12,500.50") as a number; null when empty, NaN when it is not one. */
export function parseAmount(v) {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (!s) return null;
  return /^\d+(\.\d{1,2})?$/.test(s) ? Number(s) : NaN;
}

/**
 * A sold account's lines from the boxes ({ [line]: { premium, carrier } }):
 * those with a premium, and their total; `error` says what is wrong.
 */
export function soldLines(boxes) {
  const lines = [];
  for (const [key, label] of SOLD_LINES) {
    const premium = parseAmount(boxes?.[key]?.premium);
    if (premium === null || premium === 0) continue;
    if (Number.isNaN(premium)) return { error: `${label}: enter the premium as an amount` };
    const carrier = String(boxes?.[key]?.carrier ?? "").trim();
    if (!carrier) return { error: `${label}: choose the carrier it was placed with` };
    lines.push({ line: key, premium, carrier });
  }
  if (!lines.length) return { error: "Enter the premium on at least one policy line" };
  return { lines, total: Math.round(lines.reduce((t, l) => t + l.premium, 0) * 100) / 100 };
}

/** Whether an update is late: past the day it was due by (5 business days after), with no status yet. */
export const overdue = (status, dueOn, today) => status === "no_status" && Boolean(dueOn) && today > dueOn;
