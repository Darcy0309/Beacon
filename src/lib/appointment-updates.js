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
  // Given by the system once an update's due date passes with none (Sean, Nov 2026): listed and filtered by, not picked.
  ["valid_not_updated", "Valid-Not Updated", "var(--neon-cyan)"],
];
/** The statuses given by the system, not offered to pick. */
export const SYSTEM_STATUSES = new Set(["valid_not_updated"]);
/** The statuses someone can give an appointment. */
export const PICKABLE_STATUSES = UPDATE_STATUSES.filter(([k]) => !SYSTEM_STATUSES.has(k));
export const STATUS_KEYS = PICKABLE_STATUSES.map(([k]) => k);
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

/**
 * The line under an appointment's update status about its due date, or null: "Due by Nov 12", "Overdue · due Nov 12",
 * and once the system has made it Valid-Not Updated, "Not updated · was due Nov 12" (Sean: "the red overdue date …
 * will stay"). Nothing for one found invalid: it needs no update. `late` when it is to show in red.
 */
export function dueLine({ update, dueOn, invalid }, today, day) {
  if (!dueOn || invalid) return null;
  if (update === "valid_not_updated") return { text: `Not updated · was due ${day(dueOn)}`, late: true };
  if (update !== "no_status") return null;
  return overdue(update, dueOn, today) ? { text: `Overdue · due ${day(dueOn)}`, late: true } : { text: `Due by ${day(dueOn)}`, late: false };
}

/** Who made an update, as its history names them: the system's Valid-Not Updated says so. */
export const updateBy = (status, name) => name ?? (SYSTEM_STATUSES.has(status) ? "Lighthouse (not updated by the due date)" : "—");
