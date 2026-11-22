// Campaign Types (Sean, Nov 2026): a lead sheet laid out for an industry other than insurance. A type renames or
// turns off the insurance fields (its tabs, the Business details, the key date, the policy lines) and adds fields
// of its own; a client is given one, and its leads show that layout. No type: Insurance, as before.
// Pure, so the pages, the forms and the actions share it.

import { POLICY_LINES } from "./coverage.js";

/** The insurance layout's parts a type can rename or turn off, by tab. Company and phone always show. */
export const BUILTIN_FIELDS = {
  tabs: [
    { key: "tab_business", label: "Business", fixed: true },
    { key: "tab_coverage", label: "Coverage" },
  ],
  business: [
    { key: "sic", label: "SIC code" },
    { key: "locations", label: "Locations" },
    { key: "employees", label: "Employees" },
    { key: "subcontractors", label: "Sub-contractors" },
    { key: "autos", label: "Autos" },
    { key: "dot_number", label: "DOT#" },
    { key: "cargo", label: "Cargo" },
    { key: "xmod", label: "XMOD" },
    { key: "sales_volume", label: "Sales volume" },
    { key: "annual_payroll", label: "Annual payroll" },
    { key: "ein", label: "EIN" },
    { key: "years_in_business", label: "Years in business" },
    { key: "estimated_annual_premium", label: "Est. annual premium" },
    { key: "claims_3yrs", label: "Claims last 3 yrs" },
    { key: "professionals", label: "Professionals" },
    { key: "covered_employees", label: "Covered employees" },
  ],
  coverage: [
    // The key date: renamed (a contract renewal), it keeps X-Dates by Month, the Match Tool and conversion working.
    { key: "ultimate_xdate", label: "Ultimate XDate" },
    { key: "agency", label: "Agency" },
    ...POLICY_LINES.map((l) => ({ key: `line_${l.key}`, label: l.label })),
  ],
  // The project profile (Project Info, phase 2): its sections (info_sec_*) and their rows, each renamed or turned off.
  info: [
    { key: "info_sec_agent", label: "Agent & office", section: true },
    { key: "info_agent", label: "Project agent", in: "agent" },
    { key: "info_office", label: "Address", in: "agent" },
    { key: "info_phone", label: "Phone", in: "agent" },
    { key: "info_mobile", label: "Mobile", in: "agent" },
    { key: "info_email", label: "Email", in: "agent" },
    { key: "info_states", label: "States licensed", in: "agent" },
    { key: "info_sec_producers", label: "Producers taking appointments", section: true },
    { key: "info_sec_carriers", label: "Carriers", section: true },
    { key: "info_top_carriers", label: "Top carriers", in: "carriers" },
    { key: "info_avoid_carriers", label: "Can't compete with", in: "carriers" },
    { key: "info_sec_appointments", label: "Appointments", section: true },
    { key: "info_avoid_days", label: "Days to avoid", in: "appointments" },
    { key: "info_min_employees", label: "Minimum employees", in: "appointments" },
    { key: "info_personal_lines", label: "Personal home/auto", in: "appointments" },
    { key: "info_wc_mono", label: "Work comp only", in: "appointments" },
    { key: "info_auto_mono", label: "Commercial auto only", in: "appointments" },
    { key: "info_health_only", label: "Group health only", in: "appointments" },
    { key: "info_quote_time", label: "Time to put a quote together", in: "appointments" },
    { key: "info_quote_min_time", label: "Least time needed to quote", in: "appointments" },
    { key: "info_sec_about", label: "About the agency", section: true },
    { key: "info_special_programs", label: "Special programs & services", in: "about" },
    { key: "info_value_added", label: "Value-added services", in: "about" },
    { key: "info_exclusive_program", label: "Exclusive programs", in: "about" },
    { key: "info_industry_notes", label: "In the industry", in: "about" },
  ],
};

/**
 * What each Project Info part keeps: its columns on the project's profile and on the project (its office), so a
 * part a type turns off is left out of a save and what it holds is kept.
 */
export const INFO_COLUMNS = {
  info_agent: { office: ["contact_name"] },
  info_office: { office: ["address", "city", "state", "zip"] },
  info_phone: { office: ["phone"] },
  info_mobile: { profile: ["agent_mobile"] },
  info_email: { profile: ["agent_email"] },
  info_states: { profile: ["states_licensed"] },
  info_sec_producers: { profile: ["producers"] },
  info_top_carriers: { profile: ["top_carriers"] },
  info_avoid_carriers: { profile: ["avoid_carriers"] },
  info_avoid_days: { profile: ["avoid_days"] },
  info_min_employees: { profile: ["min_employees"] },
  info_personal_lines: { profile: ["personal_lines"] },
  info_wc_mono: { profile: ["wc_mono", "wc_min_employees"] },
  info_auto_mono: { profile: ["auto_mono", "auto_min_autos"] },
  info_health_only: { profile: ["health_only", "health_min_lives"] },
  info_quote_time: { profile: ["quote_time"] },
  info_quote_min_time: { profile: ["quote_min_time"] },
  info_special_programs: { profile: ["special_programs"] },
  info_value_added: { profile: ["value_added"] },
  info_exclusive_program: { profile: ["exclusive_program"] },
  info_industry_notes: { profile: ["industry_notes"] },
};
const INFO_SECTION_OF = Object.fromEntries(BUILTIN_FIELDS.info.filter((f) => f.in).map((f) => [f.key, `info_sec_${f.in}`]));

/** The kinds of field a type can add. */
export const CUSTOM_TYPES = [
  ["text", "Text"], ["number", "Number"], ["date", "Date"], ["yesno", "Yes / No"], ["select", "Pick from a list"],
];

const ALL_KEYS = new Set(Object.values(BUILTIN_FIELDS).flat().map((f) => f.key));
const DEFAULT_LABEL = Object.fromEntries(Object.values(BUILTIN_FIELDS).flat().map((f) => [f.key, f.label]));
const FIXED = new Set(Object.values(BUILTIN_FIELDS).flat().filter((f) => f.fixed).map((f) => f.key));

/**
 * How a lead sheet is laid out for a campaign type (`type`: { name, fields }, or null for Insurance):
 * { name, insurance, label(key), hidden(key), custom: [{ id, label, type, options }] }.
 */
export function campaignView(type) {
  const builtin = type?.fields?.builtin ?? {};
  return {
    name: type?.name ?? "Insurance",
    insurance: !type,
    label: (key) => String(builtin[key]?.label ?? "").trim() || DEFAULT_LABEL[key] || key,
    // A Project Info row is off with its section, too.
    hidden: (key) => !FIXED.has(key) && (Boolean(builtin[key]?.hidden) || Boolean(INFO_SECTION_OF[key] && builtin[INFO_SECTION_OF[key]]?.hidden)),
    custom: Array.isArray(type?.fields?.custom) ? type.fields.custom : [],
    // Its own Project Info questions (phase 2).
    infoCustom: Array.isArray(type?.fields?.info_custom) ? type.fields.info_custom : [],
  };
}

/**
 * A type's fields as the builder sends them, made safe to keep: known keys only, labels of up to 40 characters,
 * at most 60 fields of its own, each with a kind from CUSTOM_TYPES and, for a list, up to 50 choices.
 * { fields } or { error }.
 */
export function cleanFields(input) {
  const builtin = {};
  for (const [key, v] of Object.entries(input?.builtin ?? {})) {
    if (!ALL_KEYS.has(key)) continue;
    const label = String(v?.label ?? "").trim().slice(0, 40);
    const hidden = !FIXED.has(key) && Boolean(v?.hidden);
    if ((label && label !== DEFAULT_LABEL[key]) || hidden) builtin[key] = { ...(label && label !== DEFAULT_LABEL[key] ? { label } : {}), ...(hidden ? { hidden } : {}) };
  }
  const kinds = new Set(CUSTOM_TYPES.map(([k]) => k));
  const ids = new Set();
  const list = (items) => {
  const custom = [];
  for (const f of Array.isArray(items) ? items.slice(0, 60) : []) {
    const label = String(f?.label ?? "").trim().slice(0, 40);
    if (!label) continue;
    if (!kinds.has(f?.type)) return { error: `Choose what kind of field "${label}" is.` };
    let id = String(f?.id ?? "").replace(/[^a-z0-9_]/gi, "").slice(0, 24);
    if (!id || ids.has(id)) id = `f${Math.random().toString(36).slice(2, 10)}`;
    ids.add(id);
    const options = f.type === "select"
      ? [...new Set((Array.isArray(f.options) ? f.options : String(f.options ?? "").split(/[,\n]/)).map((o) => String(o).trim().slice(0, 60)).filter(Boolean))].slice(0, 50)
      : undefined;
    if (f.type === "select" && !options.length) return { error: `Give "${label}" the choices to pick from.` };
    custom.push({ id, label, type: f.type, ...(options ? { options } : {}) });
  }
  return { custom };
  };
  const business = list(input?.custom);
  if (business.error) return business;
  const info = list(input?.info_custom);
  if (info.error) return info;
  return { fields: { builtin, custom: business.custom, info_custom: info.custom } };
}

/**
 * A lead's answers to its type's own fields, from a form (each `custom.<id>`), checked against the field's kind:
 * a number a number, a date YYYY-MM-DD, Yes or No, a list's choice one of its choices, text up to 500 characters.
 * Blank clears it. { values } (only those on the form) or { error, field }.
 */
export function customFromForm(custom, formData, prefix = "custom.") {
  const values = {};
  for (const f of custom ?? []) {
    const name = `${prefix}${f.id}`;
    if (!formData.has(name)) continue;
    const raw = String(formData.get(name) ?? "").trim();
    if (!raw) { values[f.id] = null; continue; }
    if (f.type === "number") {
      const n = Number(raw.replace(/[,$\s]/g, ""));
      if (!Number.isFinite(n)) return { error: `${f.label}: enter a number`, field: name };
      values[f.id] = n;
    } else if (f.type === "date") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { error: `${f.label}: choose a date`, field: name };
      values[f.id] = raw;
    } else if (f.type === "yesno") {
      values[f.id] = raw === "yes" ? true : raw === "no" ? false : null;
    } else if (f.type === "select") {
      if (!(f.options ?? []).includes(raw)) return { error: `${f.label}: choose one of its choices`, field: name };
      values[f.id] = raw;
    } else {
      values[f.id] = raw.slice(0, 500);
    }
  }
  return { values };
}

/** A custom answer as the lead sheet says it. */
export function customText(field, value) {
  if (value === null || value === undefined || value === "") return null;
  if (field.type === "yesno") return value === true ? "Yes" : value === false ? "No" : null;
  if (field.type === "number") return Number(value).toLocaleString("en-US");
  return String(value);
}
