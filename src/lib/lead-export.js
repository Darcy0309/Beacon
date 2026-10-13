/**
 * A project's leads as a CSV in the import template's own columns, so the
 * file an administrator exports can be imported again (into this project or
 * another) and read the same. Pure: the route reads the rows, this lays them
 * out.
 */

import { TEMPLATE_HEADERS } from "./csv.js";

/** A date (YYYY-MM-DD…) as the lists write it: 8/17/2026. Blank for none. */
const usDate = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d ?? ""));
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : "";
};

/**
 * The appointment a lead has now: the latest made that has not been marked
 * invalid, as its lead sheet shows. Null for none.
 */
export function currentAppointment(appointments) {
  return [...(appointments ?? [])]
    .filter((a) => !a.invalid_at)
    .sort((a, b) => String(b.appt_create_date ?? "").localeCompare(String(a.appt_create_date ?? "")) || b.id - a.id)[0] ?? null;
}

// The lead's result where it stands now, under the column for its kind of
// project; the other column keeps what the lead last had there.
const resultOf = (r, type, kept) => (r.result?.project_type === type ? r.result.name : null) ?? kept;

// Each of the template's headings, and where its value comes from.
// `r`: { lead, insurance, note, appointment, result: { name, project_type }, sicDescription }.
const TEMPLATE_VALUES = {
  "Company": (r) => r.lead.company_name,
  "Contact": (r) => r.lead.contact_name,
  "Contact Title": (r) => r.lead.contact_title,
  "Phone": (r) => r.lead.phone,
  "Mobile Phone": (r) => r.lead.contact_mobile,
  "Email": (r) => r.lead.email,
  "Fax": (r) => r.lead.fax,
  "Website": (r) => r.lead.website,
  "Decision Maker": (r) => r.lead.decision_maker,
  "DM Title": (r) => r.lead.dm_title,
  "DM Phone": (r) => r.lead.dm_phone,
  "DM Cell": (r) => r.lead.dm_mobile,
  "DM Email": (r) => r.lead.dm_email,
  "Address": (r) => r.lead.address,
  "City": (r) => r.lead.city,
  "State": (r) => r.lead.state,
  "Zip": (r) => r.lead.zip,
  "County": (r) => r.lead.county,
  "Territory": (r) => r.lead.territory,
  "SIC Code": (r) => r.lead.sic_code,
  "SIC Description": (r) => r.sicDescription,
  "Employees": (r) => r.lead.employees,
  "Autos": (r) => r.lead.autos,
  "Sales Volume": (r) => r.lead.sales_volume,
  "Locations": (r) => r.lead.location,
  "EIN": (r) => r.lead.ein,
  "Years In Business": (r) => r.lead.years_in_business,
  "Estimated Annual Premium": (r) => r.lead.estimated_annual_premium,
  "Producer Name": (r) => r.lead.producer_name,
  "List Source": (r) => r.lead.list_source,
  "Ultimate XDate": (r) => usDate(r.insurance?.ultimate_xdate),
  "Package XDate": (r) => usDate(r.insurance?.pkg_xdate),
  "Package Carrier": (r) => r.insurance?.pkg_carrier,
  "Work Comp XDate": (r) => usDate(r.insurance?.wc_xdate),
  "Work Comp Carrier": (r) => r.insurance?.wc_carrier,
  "Auto XDate": (r) => usDate(r.insurance?.auto_xdate),
  "Auto Carrier": (r) => r.insurance?.auto_carrier,
  "Health XDate": (r) => usDate(r.insurance?.health_xdate),
  "Health Carrier": (r) => r.insurance?.health_carrier,
  "Dental XDate": (r) => usDate(r.insurance?.dental_xdate),
  "Dental Provider": (r) => r.insurance?.dental_provider,
  "Vision XDate": (r) => usDate(r.insurance?.vision_xdate),
  "Vision Provider": (r) => r.insurance?.vision_provider,
  "Prof Liab XDate": (r) => usDate(r.insurance?.prof_liab_xdate),
  "Prof Liab Carrier": (r) => r.insurance?.prof_liab_carrier,
  "DO XDate": (r) => usDate(r.insurance?.do_xdate),
  "DO Carrier": (r) => r.insurance?.do_carrier,
  "EO XDate": (r) => usDate(r.insurance?.eo_xdate),
  "EO Carrier": (r) => r.insurance?.eo_carrier,
  "Agency Name": (r) => r.insurance?.agency_name,
  "Years With Agency": (r) => r.insurance?.agency_years,
  "Call Result DBDV": (r) => resultOf(r, "DBDV", r.lead.call_result_dbdv),
  "Call Result Appt": (r) => resultOf(r, "APPT", r.lead.call_result_appt),
  "Appointment Date": (r) => usDate(r.appointment?.appt_date),
  "Appointment Time": (r) => r.appointment?.appt_time,
  "Notes": (r) => r.lead.client_note,
  "Internal Notes": (r) => r.note,
};

// What a lead also carries that the template leaves out. The import reads
// these headings too, so nothing on a lead is lost between the two.
const EXTRA_VALUES = {
  "Contact 2": (r) => r.lead.contact2_name,
  "Contact 2 Title": (r) => r.lead.contact2_title,
  "Contact 2 Phone": (r) => r.lead.contact2_phone,
  "Contact 2 Mobile": (r) => r.lead.contact2_mobile,
  "Contact 2 Email": (r) => r.lead.contact2_email,
  "Description": (r) => r.lead.description,
};

/** The export's headings: the import template's, in its order, then the extras. */
export const EXPORT_HEADERS = [...TEMPLATE_HEADERS, ...Object.keys(EXTRA_VALUES)];

/** A lead's values, one for each of EXPORT_HEADERS. */
export function exportCells(r) {
  return EXPORT_HEADERS.map((h) => (TEMPLATE_VALUES[h] ?? EXTRA_VALUES[h])?.(r) ?? "");
}

/**
 * One value in a CSV: quoted when it holds a comma, a quote or a new line.
 * One that would open as a formula in a spreadsheet ("=", "+", "-", "@"
 * first) gets an apostrophe before it, which the import takes off again.
 */
export function csvCell(v) {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** A row of values as one CSV line (no line ending). */
export const csvLine = (cells) => cells.map(csvCell).join(",");

/** A file name for a project's export: "CapitalIns-Maricopa_2026_DBDev_2026-10-13.csv". */
export const exportFileName = (project, day) =>
  `${String(project ?? "").trim().replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "project"}_${day}.csv`;
