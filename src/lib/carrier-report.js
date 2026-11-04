/**
 * A carrier's report (Sean, Nov 2026): a client's leads (X-dates) naming the
 * carrier, as a table and a CSV. Each lead's `lines` (from
 * carrier_client_leads()): [{ key, xdate, carrier, mine }], the policy lines
 * with something on them, `mine` those naming this carrier. Pure, so the
 * page and the tests share it.
 */

import { POLICY_LINES } from "./coverage.js";

/** Every policy line's name, by its key; the two the lead sheet leaves out too. */
export const LINE_LABELS = {
  ...Object.fromEntries(POLICY_LINES.map((l) => [l.key, l.label])),
  homeowner: "Homeowner",
  personal_auto: "Personal auto",
};
const ORDER = Object.keys(LINE_LABELS);

/** "2027-03-01" as "03/01/2027", as the old system's lists write it. */
export const usDate = (d) => (d ? `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}` : "");

const cell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * The leads as a CSV: the business, city, state, ZIP, phone and project, its renewal, then an X-date
 * and a carrier for each policy line any of them has (in the lead sheet's order), and when it was created.
 */
export function carrierLeadsCsv(rows) {
  const used = new Set((rows ?? []).flatMap((r) => (r.lines ?? []).map((l) => l.key)));
  const lines = ORDER.filter((k) => used.has(k));
  const head = ["Business", "City", "ST", "Zip", "Phone", "Project", "Renewal", ...lines.flatMap((k) => [`${LINE_LABELS[k]} XDate`, `${LINE_LABELS[k]} Carrier`]), "Date Lead Created"];
  const line = (r) => {
    const by = Object.fromEntries((r.lines ?? []).map((l) => [l.key, l]));
    return [r.company, r.city, r.state, r.zip, r.phone, r.project, usDate(r.ultimate_xdate),
      ...lines.flatMap((k) => [usDate(by[k]?.xdate), by[k]?.carrier ?? ""]), usDate(r.created)];
  };
  return [head, ...(rows ?? []).map(line)].map((r) => r.map(cell).join(",")).join("\r\n");
}
