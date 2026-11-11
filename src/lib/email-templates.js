/**
 * Email templates (client, Nov 2026): what an administrator writes once, filled in for each lead
 * when a manager picks it in the Email box. Pure, for the dialog, the settings card and tests.
 *
 * A template's subject and message may name {first_name} (the contact's), {company} (the lead's
 * business), {my_name} (the sender's), {signature} (the sender's signature for the client the
 * lead is for), and (Nov 2026) {appt_date} and {appt_time} (the lead's appointment) and
 * {agent_name} (the client's agent: the appointment's rep, else the lead's producer). A message
 * without {signature} gets it at its foot, as an email written by hand does.
 */

export const TEMPLATE_FIELDS = [
  ["first_name", "Contact's first name"],
  ["company", "Company"],
  ["my_name", "Your name"],
  ["signature", "Your signature"],
  ["appt_date", "Appointment date"],
  ["appt_time", "Appointment time"],
  ["agent_name", "Agent's name"],
];
const KEYS = TEMPLATE_FIELDS.map(([k]) => k).join("|");
const FIELD = new RegExp(`(\\s?)\\{\\s*(${KEYS})\\s*\\}`, "gi");

/** An appointment's day for an email: "Thursday, November 12" (", 2027" when not this year). `date`: "YYYY-MM-DD". */
export function apptDateText(date, thisYear = String(new Date().getFullYear())) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? ""));
  if (!m) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC", weekday: "long", month: "long", day: "numeric", ...(m[1] !== String(thisYear) ? { year: "numeric" } : {}),
  }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
}

/** Each template file at most this, and all of an email's together. */
export const TEMPLATE_FILE_MB = 10;
export const EMAIL_ATTACH_MB = 20;

/** `text` with its {fields} filled from `values`; a field with nothing to fill goes, with the space before it. */
export function fillTemplate(text, values = {}) {
  return String(text ?? "").replace(FIELD, (_, space, key) => {
    const v = String(values[key.toLowerCase()] ?? "").trim();
    return v ? `${space}${v}` : "";
  });
}

/**
 * A template made into an email for one lead: { subject, body }.
 *   template  { subject, body }; values  { first_name, company, my_name, signature, appt_date, appt_time, agent_name }
 */
export function templateDraft(template, values = {}) {
  const subject = fillTemplate(template?.subject, values).replace(/\s+/g, " ").trim();
  const raw = String(template?.body ?? "");
  const signed = /\{\s*signature\s*\}/i.test(raw) || !values.signature;
  const body = fillTemplate(raw, values).replace(/\s+$/, "");
  return { subject, body: signed ? body : `${body}\n\n${values.signature}` };
}

/** "2.4 MB", "830 KB". */
export const fileSize = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
