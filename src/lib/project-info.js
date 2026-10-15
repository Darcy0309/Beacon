/**
 * Project Info (Sean, Oct 2026): the client profile sheet kept with each
 * project. Its choices, and how it reads: the agent's area code (what
 * managers set their caller ID to), directions from the agent's office to a
 * lead, the producers emailed each lead, the weekdays to avoid. Pure, so
 * the forms, the pages, the calendar and the tests share it.
 */

import { PHONE_EXTENSION } from "./format.js";

/** The states and DC, by their two letters in alphabetical order. */
export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS",
  "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY",
  "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
].sort();

/** The days of the week, Monday first: [day, short, long] (0 is Sunday, as a Date counts them). */
export const WEEKDAYS = [
  [1, "Mon", "Monday"], [2, "Tue", "Tuesday"], [3, "Wed", "Wednesday"], [4, "Thu", "Thursday"],
  [5, "Fri", "Friday"], [6, "Sat", "Saturday"], [0, "Sun", "Sunday"],
];

/** How long an agency wants to put a quote together, and the least it needs. */
export const QUOTE_TIMES = ["1-2 months", "2-3 months", "3-4 months"];
export const QUOTE_MIN_TIMES = ["1-2 weeks", "3-4 weeks"];

/** The fewest employees an appointment needs: 0 to 250. */
export const MIN_EMPLOYEES_MAX = 250;

/** Producers taking appointments: up to five. */
export const MAX_PRODUCERS = 5;

/** Weekdays in the week's order, as words: "Mon & Fri", "Mon, Wed & Fri" ("Mondays & Fridays" with `plural`). */
export function weekdayList(days, { plural = false } = {}) {
  const want = new Set((days ?? []).map(Number));
  const names = WEEKDAYS.filter(([d]) => want.has(d)).map(([, short, long]) => (plural ? `${long}s` : short));
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : names[0] ?? "";
}

/** The area code of a US phone number: "(715) 934-2400 x12" → "715". Null when it is not a full number. */
export function areaCode(phone) {
  const digits = String(phone ?? "").replace(PHONE_EXTENSION, "").replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return ten.length === 10 ? ten.slice(0, 3) : null;
}

/** An address on one line: "15561 Railroad St, Hayward, WI 54843". */
export const addressLine = ({ address, city, state, zip } = {}) =>
  [address, city, [state, zip].filter(Boolean).join(" ")].map((v) => String(v ?? "").trim()).filter(Boolean).join(", ");

/** Where a lead's business is, for directions: its city, state and ZIP ("Eau Claire, WI 54701"). */
export const leadPlace = ({ city, state, zip } = {}) => addressLine({ city, state, zip });

/**
 * Google Maps directions from the agent's office to a lead's city, by car:
 * the miles and the drive time, in a page of its own. Null without both.
 */
export const directionsLink = (from, to) =>
  from && to
    ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&travelmode=driving`
    : null;

/**
 * Producers as they are kept: each { first, last, email, leads }, trimmed,
 * the empty rows dropped, at most five. `leads`: they get each lead and
 * appointment by email (only with an address to send to).
 */
export function cleanProducers(list) {
  const text = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return (Array.isArray(list) ? list : [])
    .map((p) => {
      const email = text(p?.email, 254);
      return { first: text(p?.first, 40), last: text(p?.last, 40), email, leads: Boolean(p?.leads && email) };
    })
    .filter((p) => p.first || p.last || p.email)
    .slice(0, MAX_PRODUCERS);
}

/** The producers who get each lead and appointment by email: their addresses. */
export const producerAddresses = (producers) => cleanProducers(producers).filter((p) => p.leads).map((p) => p.email);

/** A producer's name: "Josh Huray", or "" for one known only by their address. */
export const producerName = (p) => [p?.first, p?.last].filter(Boolean).join(" ");

/** Yes, No, or nothing, for a question left unanswered. */
export const yesNoOf = (v) => (v === true ? "Yes" : v === false ? "No" : null);

/** A yes/no question with its number: "Yes · 10+ employees", "No". */
export function yesWith(yes, count, unit) {
  if (yes !== true) return yesNoOf(yes);
  return count == null || count === "" ? "Yes" : `Yes · ${Number(count).toLocaleString("en-US")}+ ${unit}`;
}

/** The project whose Project Info a project shows: the appointment project a DB dev project promotes to, else its own. */
export const infoProjectOf = (project) => project?.appt_project_id ?? project?.id ?? null;

/** Whether anything has been filled in beyond the project's office. */
export function hasProfile(info) {
  if (!info) return false;
  const lists = ["states_licensed", "top_carriers", "avoid_carriers", "avoid_days"].some((k) => info[k]?.length);
  const values = ["agent_mobile", "agent_email", "special_programs", "personal_lines", "min_employees", "quote_time", "quote_min_time",
    "wc_mono", "auto_mono", "health_only", "value_added", "exclusive_program", "industry_notes"].some((k) => info[k] != null && info[k] !== "");
  return lists || values || cleanProducers(info.producers).length > 0;
}
