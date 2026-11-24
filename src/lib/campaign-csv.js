// Campaign Types' import and export (Sean, Nov 2026, phase 3: "clients see the campaign's fields everywhere they see
// lead fields now … import/export"). A client's campaign type lays out the lead CSV as it lays out the lead sheet: the
// insurance columns it turns off left out, those it renames under their new names, and its own fields as columns of
// their own; and the importer reads a file laid out that way back. Insurance (no type): the template as it is.
// Pure, so the export, the importer (in the browser and on the server) and the tests share it.

import { TEMPLATE_HEADERS, mapAllHeaders, parseDate } from "./csv.js";
import { EXPORT_HEADERS, exportCells } from "./lead-export.js";
import { campaignView } from "./campaign-types.js";
import { POLICY_LINES } from "./coverage.js";

const norm = (h) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// The template's columns each of a type's built-in parts holds (a part turned off, its columns left out).
const LINE_HEADERS = {
  pkg: ["Package XDate", "Package Carrier"], wc: ["Work Comp XDate", "Work Comp Carrier"], auto: ["Auto XDate", "Auto Carrier"],
  health: ["Health XDate", "Health Carrier"], personal: ["Personal Lines XDate", "Personal Lines Carrier"],
  prof: ["Prof Liab XDate", "Prof Liab Carrier"], do: ["DO XDate", "DO Carrier"], eo: ["EO XDate", "EO Carrier"],
  dental: ["Dental XDate", "Dental Provider"], vision: ["Vision XDate", "Vision Provider"],
};
export const PART_HEADERS = {
  sic: ["SIC Code", "SIC Description"],
  locations: ["Locations", "Building Own/Lease", "Building Age", "Building Stories", "Building Acres"],
  employees: ["Employees", "Full-Time Employees", "Part-Time Employees"],
  subcontractors: ["Subcontractors %"],
  autos: ["Autos", "Drivers", "Vehicle Types", "Travel Radius"],
  dot_number: ["DOT Number"], cargo: ["Cargo"], xmod: ["XMOD"], sales_volume: ["Sales Volume"], annual_payroll: ["Annual Payroll"],
  ein: ["EIN"], years_in_business: ["Years In Business"], estimated_annual_premium: ["Estimated Annual Premium"],
  claims_3yrs: ["Claims Last 3 Yrs"], professionals: ["Professionals"], covered_employees: ["Covered Employees"],
  ultimate_xdate: ["Ultimate XDate"],
  agency: ["Agency Name", "Years With Agency"],
  ...Object.fromEntries(POLICY_LINES.filter((l) => LINE_HEADERS[l.key]).map((l) => [`line_${l.key}`, LINE_HEADERS[l.key]])),
};
const PART_OF = Object.fromEntries(Object.entries(PART_HEADERS).flatMap(([key, hs]) => hs.map((h) => [h, key])));
const COVERAGE = new Set(["ultimate_xdate", "agency", ...POLICY_LINES.map((l) => `line_${l.key}`)]);

/** A date as the lists write it: 8/17/2026. */
const usDate = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d ?? ""));
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : "";
};

/** A type's own answer as a CSV cell: several choices separated by "; " (a choice may hold a comma). */
export function customCell(field, value) {
  if (value === null || value === undefined || value === "") return "";
  if (field.type === "yesno") return value === true ? "Yes" : value === false ? "No" : "";
  if (field.type === "percent") return `${value}%`;
  if (field.type === "date") return usDate(value);
  if (Array.isArray(value)) return value.join("; ");
  return String(value);
}

/**
 * A type's own answer read from a CSV cell, by the field's kind; null when it can't be (a number that isn't, a
 * choice not on its list: left blank rather than kept wrong). Several choices: separated by ";", "|" or new lines,
 * or by commas when that's how they read; matched to the list whatever their case.
 */
export function customFromCell(field, text) {
  const v = String(text ?? "").trim();
  if (!v) return null;
  if (field.type === "number" || field.type === "percent") {
    const n = Number(v.replace(/[,$%\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (field.type === "date") return parseDate(v);
  if (field.type === "yesno") return /^(y|yes|true|1|x)$/i.test(v) ? true : /^(n|no|false|0)$/i.test(v) ? false : null;
  const find = (s) => (field.options ?? []).find((o) => o.toLowerCase() === String(s).trim().toLowerCase()) ?? null;
  if (field.type === "select") return find(v);
  if (field.type === "multi") {
    const picked = [];
    for (const piece of v.split(/\s*[;|\n]\s*/)) {
      const whole = find(piece);
      const parts = whole ? [whole] : piece.split(",").map(find);
      for (const p of parts) if (p && !picked.includes(p)) picked.push(p);
    }
    return picked.length ? picked : null;
  }
  return v.slice(0, 500);
}

/**
 * A campaign type's CSV (`type`: { name, fields }, or null for Insurance): its columns in order, each
 * { heading, from } (a template column's values) or { heading, field } (one of its own); and `aliases`, the headings
 * the importer reads besides the template's: { normalized heading: target } (renamed parts as their columns, its
 * own fields into the lead's answers). An Insurance client's: the template as it is, and none.
 */
export function campaignCsv(type) {
  if (!type) return { columns: EXPORT_HEADERS.map((h) => ({ heading: h, from: h })), aliases: {} };
  const view = campaignView(type);
  const off = (key) => Boolean(key) && (view.hidden(key) || (COVERAGE.has(key) && view.hidden("tab_coverage")));
  const columns = [];
  const aliases = {};
  const taken = new Set();
  for (const h of EXPORT_HEADERS) {
    const key = PART_OF[h];
    if (off(key)) continue;
    // A part of one column renamed (the key date as "Contract renewal"): its new name.
    const renamed = key && PART_HEADERS[key].length === 1 && view.label(key) !== BUILTIN_LABEL(key) ? view.label(key) : null;
    const heading = renamed ?? h;
    columns.push({ heading, from: h });
    taken.add(norm(heading));
    if (renamed) aliases[norm(renamed)] = mapAllHeaders([h])[0];
  }
  for (const field of view.custom) {
    let heading = field.label;
    for (let n = 2; taken.has(norm(heading)); n++) heading = `${field.label} (${n})`;
    taken.add(norm(heading));
    columns.push({ heading, field });
    aliases[norm(heading)] = { table: "custom", column: field.id, parse: (v) => customFromCell(field, v) };
  }
  return { columns, aliases };
}

// A part's own name, to tell whether a type renamed it.
const BUILTIN_LABEL = (key) => campaignView(null).label(key);

/** The headings of a type's CSV, as its import template is. */
export const campaignHeadings = (type) => campaignCsv(type).columns.map((c) => c.heading);

/** A lead's cells in a type's CSV (`r` as exportCells takes it; its own answers on `r.lead.custom`). */
export function campaignCells(layout, r) {
  const cells = exportCells(r);
  const at = new Map(EXPORT_HEADERS.map((h, i) => [h, i]));
  return layout.columns.map((c) => (c.field ? customCell(c.field, r.lead?.custom?.[c.field.id]) : cells[at.get(c.from)] ?? ""));
}

export { TEMPLATE_HEADERS };
