/**
 * Email templates (client, Nov 2026): what an administrator writes once, filled in for each lead
 * when a manager picks it in the Email box. Pure, for the dialog, the settings card and tests.
 *
 * A template's subject and message may name {first_name} (the contact's), {company} (the lead's
 * business), {my_name} (the sender's) and {signature} (the sender's signature for the client the
 * lead is for). A message without {signature} gets it at its foot, as an email written by hand does.
 */

export const TEMPLATE_FIELDS = [
  ["first_name", "Contact's first name"],
  ["company", "Company"],
  ["my_name", "Your name"],
  ["signature", "Your signature"],
];

/** Each template file at most this, and all of an email's together. */
export const TEMPLATE_FILE_MB = 10;
export const EMAIL_ATTACH_MB = 20;

/** `text` with its {fields} filled from `values`; a field with nothing to fill goes, with the space before it. */
export function fillTemplate(text, values = {}) {
  return String(text ?? "").replace(/(\s?)\{\s*(first_name|company|my_name|signature)\s*\}/gi, (_, space, key) => {
    const v = String(values[key.toLowerCase()] ?? "").trim();
    return v ? `${space}${v}` : "";
  });
}

/**
 * A template made into an email for one lead: { subject, body }.
 *   template  { subject, body }; values  { first_name, company, my_name, signature }
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
