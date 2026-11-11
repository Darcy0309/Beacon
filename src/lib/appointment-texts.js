// Appointment reminder texts (client, Nov 2026): the template and when it goes, as kept in Settings
// (app_settings 'appt_texts'), filled in for an appointment, and the prospect's Y/N/R reply read.
// Pure, so the server, the Settings card and the tests share it.

import { ZONES, hourLabel } from "./delivery-schedule.js";
import { TEXT_LIMIT } from "./texts.js";

export const APPT_TEXT_DEFAULTS = {
  body: "{client}: Hi {first_name}, reminder of your appointment with {agent_name} tomorrow, {appt_date} at {appt_time}. Reply Y to confirm, N to cancel, R to reschedule.",
  hour: 10,
  zone: "America/Phoenix",
};

export const APPT_TEXT_FIELDS = [
  ["first_name", "Contact's first name"],
  ["company", "Company"],
  ["client", "Client"],
  ["agent_name", "Agent's name"],
  ["appt_date", "Appointment date"],
  ["appt_time", "Appointment time"],
  ["my_name", "Who set it"],
];

// The hours it may go out: 7 AM to 7 PM (carriers frown on texts at night).
export const APPT_TEXT_HOURS = Array.from({ length: 13 }, (_, i) => i + 7);

const KEYS = APPT_TEXT_FIELDS.map(([k]) => k).join("|");
const FIELD = new RegExp(`(\\s?)\\{\\s*(${KEYS})\\s*\\}`, "gi");

/** The setting as kept, each value checked, the defaults for the rest. `fallbackZone`: the business's clock. */
export function apptTextSettings(value, fallbackZone = APPT_TEXT_DEFAULTS.zone) {
  const v = value ?? {};
  const body = typeof v.body === "string" && v.body.trim() ? v.body.trim().slice(0, TEXT_LIMIT) : APPT_TEXT_DEFAULTS.body;
  const hour = APPT_TEXT_HOURS.includes(Number(v.hour)) ? Number(v.hour) : APPT_TEXT_DEFAULTS.hour;
  const zone = ZONES.some(([z]) => z === v.zone) ? v.zone : ZONES.some(([z]) => z === fallbackZone) ? fallbackZone : APPT_TEXT_DEFAULTS.zone;
  return { body, hour, zone };
}

/** "10:00 AM Arizona time, the day before". */
export function apptTextWhen(settings) {
  const zone = ZONES.find(([z]) => z === settings.zone)?.[1] ?? settings.zone;
  return `${hourLabel(settings.hour)} ${zone} time, the day before`;
}

/** The template filled in for one appointment; a field with nothing to fill goes, with the space before it. */
export function apptTextBody(template, values = {}) {
  return String(template ?? "")
    .replace(FIELD, (_, space, key) => {
      const v = String(values[key.toLowerCase()] ?? "").trim();
      return v ? `${space}${v}` : "";
    })
    .trim()
    .slice(0, TEXT_LIMIT);
}

/**
 * The prospect's answer to a reminder: "Y" (yes, confirmed), "N" (no) or "R" (reschedule), or null
 * for anything else (a question, a thank-you: told as any reply is). Forgives case, spaces,
 * punctuation and the words spelled out.
 */
export function apptReply(body) {
  const s = String(body ?? "").trim().toLowerCase().replace(/[\s.!,]+$/u, "").replace(/^[\s"']+|[\s"']+$/g, "");
  if (/^(y|yes|yep|yeah|confirm|confirmed)$/.test(s)) return "Y";
  if (/^(n|no|nope|cancel)$/.test(s)) return "N";
  if (/^(r|reschedule|re-schedule)$/.test(s)) return "R";
  return null;
}

/** What a reply means, for the appointment manager's notification. */
export const APPT_REPLY_MEANS = {
  Y: "confirmed the appointment",
  N: "can't make it, call them",
  R: "wants to reschedule, call them",
};
