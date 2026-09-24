// CSV parsing and column mapping for the lead importer (legacy Imports module).

/** Minimal RFC-4180 parser — handles quoted fields, embedded commas and newlines. */
export function parseCsv(input) {
  // Excel writes a byte-order mark; left in place it corrupts the first header.
  const text = String(input).replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (h) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

// Maps spreadsheet headings onto columns. Three destinations: the lead row
// itself, its insurance_details row, and an appointment when the sheet
// carries one. Headings are matched with letters and digits only, so
// "ULTIMATE X DATE", "UltimateXDate" and "ULTIMATEXDATE" all land together.
export const COLUMN_ALIASES = {
  // --- identity and contact -------------------------------------------
  company: "company_name", companyname: "company_name", business: "company_name",
  businessname: "company_name", account: "company_name", accountname: "company_name",
  contact: "contact_name", contact1: "contact_name", contactname: "contact_name",
  name: "contact_name", fullname: "contact_name",
  title: "contact_title", title1: "contact_title", contacttitle: "contact_title",
  jobtitle: "contact_title",
  decisionmaker: "decision_maker", dm: "decision_maker",
  dmtitle: "dm_title", decisionmakertitle: "dm_title",
  phone: "phone", phone1: "phone", phonenumber: "phone", telephone: "phone", tel: "phone",
  fax: "fax", fax1: "fax",
  email: "email", emailaddress: "email", emailid: "email",
  website: "website", web: "website", url: "website",

  // --- location -------------------------------------------------------
  address: "address", address1: "address", street: "address", streetaddress: "address",
  city: "city", state: "state", st: "state",
  zip: "zip", zipcode: "zip", postalcode: "zip",
  county: "county", territory: "territory",

  // --- firmographics --------------------------------------------------
  sic: "sic_code", siccode: "sic_code",
  sicdesc: "description", sicdescription: "description", natureofbusiness: "description",
  description: "description",
  locations: "location", numberoflocations: "location",
  employees: "employees", numberofemployees: "employees", employeecount: "employees",
  coveredemployees: "covered_employees",
  professionals: "professionals", numberofprofessionals: "professionals",
  autos: "autos", vehicles: "autos", numberofautos: "autos",
  salesvolume: "sales_volume", revenue: "sales_volume", annualrevenue: "sales_volume",
  yearsinbusiness: "years_in_business", yrsinbusiness: "years_in_business",
  premium: "estimated_annual_premium", estimatedannualpremium: "estimated_annual_premium",

  // --- campaign bookkeeping -------------------------------------------
  producer: "producer_name", producername: "producer_name",
  broker: "broker",
  listsource: "list_source", source: "list_source",
  reasontochange: "reason_to_change",
  decsheetreceived: "dec_sheet_received",
  callresultdbdv: "call_result_dbdv", calldbdv: "call_result_dbdv",
  callresultappt: "call_result_appt", callappt: "call_result_appt",
  qadatedbdv: "qa_date_dbdv", qadateappt: "qa_date_appt",
  shoppingdate: "shopping_date",
  notes: "notes_dcm", note: "notes_dcm", comments: "notes_dcm",
  notesdcm: "notes_dcm", notesdmc: "notes_dcm",
  notesclient: "notes_client", notestoclient: "notes_client",
};

/** Columns that belong on the lead's insurance_details row. */
export const INSURANCE_ALIASES = {
  agencyname: "agency_name", agency: "agency_name", currentcarrier: "agency_name",
  ultimatexdate: "ultimate_xdate", ultimatexdte: "ultimate_xdate", xdate: "ultimate_xdate",
  pkgxdate: "pkg_xdate", packagexdate: "pkg_xdate",
  pkgcarrier: "pkg_carrier", packagecarrier: "pkg_carrier",
  wcxdate: "wc_xdate", workcompxdate: "wc_xdate", workerscompxdate: "wc_xdate",
  wccarrier: "wc_carrier", workcompcarrier: "wc_carrier", workerscompcarrier: "wc_carrier",
  autoxdate: "auto_xdate", autocarrier: "auto_carrier",
  healthxdate: "health_xdate", healthcarrier: "health_carrier",
  dentalxdate: "dental_xdate", dentalprovider: "dental_provider", dentalcarrier: "dental_provider",
  visionxdate: "vision_xdate", visionprovider: "vision_provider", visioncarrier: "vision_provider",
  profliabxdate: "prof_liab_xdate", professionalliabilityxdate: "prof_liab_xdate",
  profliabcarrier: "prof_liab_carrier", professionalliabilitycarrier: "prof_liab_carrier",
  doxdate: "do_xdate", docarrier: "do_carrier",
  eoxdate: "eo_xdate", eocarrier: "eo_carrier",
  homeownerxdate: "homeowner_xdate", homeownercarrier: "homeowner_carrier",
  personalautoxdate: "personal_auto_xdate", personalautocarrier: "personal_auto_carrier",
};

/** Columns that describe a booked appointment rather than the lead. */
export const APPOINTMENT_ALIASES = {
  appointmentdate: "appt_date", apptdate: "appt_date",
  appointmenttime: "appt_time", appttime: "appt_time",
};

/** Date columns, wherever they live — these need parsing rather than copying. */
const DATE_COLUMNS = new Set([
  "qa_date_dbdv", "qa_date_appt", "shopping_date", "appt_date",
  "ultimate_xdate", "pkg_xdate", "wc_xdate", "auto_xdate", "health_xdate",
  "dental_xdate", "vision_xdate", "prof_liab_xdate", "do_xdate", "eo_xdate",
  "homeowner_xdate", "personal_auto_xdate",
]);

/**
 * Parse the US-style dates these exports carry (8/17/2026, 08-17-2026) and
 * the ISO form, to a plain YYYY-MM-DD. Anything else returns null rather
 * than a wrong date.
 */
export function parseDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const us = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!us) return null;
  const month = Number(us[1]);
  const day = Number(us[2]);
  let year = Number(us[3]);
  if (year < 100) year += year < 70 ? 2000 : 1900;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * "15:00" -> "3:00 PM". The app sorts and groups appointments by this text,
 * so a 24-hour value would file an afternoon call under the morning.
 */
export function parseTime(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const m = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2];
  const marker = (m[3] || "").toUpperCase();
  if (hour > 23 || Number(minute) > 59) return null;

  if (marker) return `${hour}:${minute} ${marker}`;
  const suffix = hour >= 12 ? "PM" : "AM";
  if (hour === 0) hour = 12;
  else if (hour > 12) hour -= 12;
  return `${hour}:${minute} ${suffix}`;
}

/**
 * Work out which lead status a row landed on from the two call-result
 * columns. The appointment result wins, being the later stage of the call.
 */
export function statusFromCallResults(dbdv, appt) {
  const a = String(appt ?? "").toLowerCase();
  const d = String(dbdv ?? "").toLowerCase();

  // A booked appointment is the furthest a row can have travelled.
  if (a.includes("phone appointment")) return "appt";
  if (a.includes("appointment") || a.includes("appt from")) return "appt";
  if (d.includes("survey")) return "survey";

  // Then the dispositions that take a row out of the pipeline.
  if (d.includes("out of business")) return "out_of_business";
  if (d.includes("disconnect")) return "disconnected";
  if (d.includes("not interested") || a.includes("never shops") || a.includes("not shopping")) {
    return "not_interested";
  }

  if (d.includes("hot")) return "hot";
  if (d.includes("profile")) return "profile";
  if (d.includes("x-date") || d.includes("xdate")) return "xdate";
  return "new";
}

/** Lead columns only — what the importer's "is this a lead sheet?" check reads. */
export function mapHeaders(headerRow) {
  return headerRow.map((h) => COLUMN_ALIASES[norm(h)] ?? null);
}

/** Every heading resolved to { table, column }, or null when unrecognised. */
export function mapAllHeaders(headerRow) {
  return headerRow.map((h) => {
    const key = norm(h);
    if (COLUMN_ALIASES[key]) return { table: "lead", column: COLUMN_ALIASES[key] };
    if (INSURANCE_ALIASES[key]) return { table: "insurance", column: INSURANCE_ALIASES[key] };
    if (APPOINTMENT_ALIASES[key]) return { table: "appointment", column: APPOINTMENT_ALIASES[key] };
    return null;
  });
}

const STATE_CODES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS",
  "KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY",
  "NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV",
  "WI","WY","DC","PR","VI","GU","AS","MP",
]);

const STATE_NAMES = {
  alabama:"AL", alaska:"AK", arizona:"AZ", arkansas:"AR", california:"CA",
  colorado:"CO", connecticut:"CT", delaware:"DE", florida:"FL", georgia:"GA",
  hawaii:"HI", idaho:"ID", illinois:"IL", indiana:"IN", iowa:"IA", kansas:"KS",
  kentucky:"KY", louisiana:"LA", maine:"ME", maryland:"MD", massachusetts:"MA",
  michigan:"MI", minnesota:"MN", mississippi:"MS", missouri:"MO", montana:"MT",
  nebraska:"NE", nevada:"NV", newhampshire:"NH", newjersey:"NJ", newmexico:"NM",
  newyork:"NY", northcarolina:"NC", northdakota:"ND", ohio:"OH", oklahoma:"OK",
  oregon:"OR", pennsylvania:"PA", rhodeisland:"RI", southcarolina:"SC",
  southdakota:"SD", tennessee:"TN", texas:"TX", utah:"UT", vermont:"VT",
  virginia:"VA", washington:"WA", westvirginia:"WV", wisconsin:"WI",
  wyoming:"WY", districtofcolumbia:"DC", puertorico:"PR",
};

/**
 * Normalise a state cell to a 2-letter code.
 * Returns null for anything unrecognised — truncating a full name would
 * silently mislabel records (e.g. "Arizona" -> "AR", which is Arkansas).
 */
export function normalizeState(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const upper = raw.toUpperCase();
  if (upper.length === 2) return STATE_CODES.has(upper) ? upper : null;
  return STATE_NAMES[raw.toLowerCase().replace(/[^a-z]/g, "")] ?? null;
}

/**
 * Turn parsed CSV rows into the three records each row can produce: the lead,
 * its insurance detail, and a booked appointment. Rows without a company name
 * are counted as errors rather than imported.
 *
 * Returns { rows, errors, headers } where headers lists the lead columns
 * recognised, and each row is { lead, insurance, appointment, status }.
 */
export function rowsToImport(csvRows) {
  if (csvRows.length < 2) return { rows: [], errors: 0, headers: [] };

  const resolved = mapAllHeaders(csvRows[0]);
  const rows = [];
  let errors = 0;

  for (const raw of csvRows.slice(1)) {
    const lead = {};
    const insurance = {};
    const appointment = {};

    resolved.forEach((target, i) => {
      if (!target) return;
      const value = (raw[i] ?? "").trim();
      if (!value) return;

      const parsed = DATE_COLUMNS.has(target.column)
        ? parseDate(value)
        : target.column === "appt_time"
          ? parseTime(value)
          : value;
      if (parsed === null) return;

      if (target.table === "lead") lead[target.column] = parsed;
      else if (target.table === "insurance") insurance[target.column] = parsed;
      else appointment[target.column] = parsed;
    });

    if (!lead.company_name) {
      errors++;
      continue;
    }
    if (lead.state) {
      const code = normalizeState(lead.state);
      // Drop an unrecognised state rather than storing a wrong one; the column
      // is only 2 characters wide.
      if (code) lead.state = code;
      else delete lead.state;
    }

    rows.push({
      lead,
      insurance: Object.keys(insurance).length ? insurance : null,
      // A time with no date is not a booking.
      appointment: appointment.appt_date ? appointment : null,
      status: statusFromCallResults(lead.call_result_dbdv, lead.call_result_appt),
    });
  }

  return {
    rows,
    errors,
    headers: resolved.filter((t) => t?.table === "lead").map((t) => t.column),
  };
}

/**
 * Lead columns only. Kept for callers that just want the lead rows.
 * Returns { records, errors, headers }.
 */
export function rowsToLeads(csvRows) {
  const { rows, errors, headers } = rowsToImport(csvRows);
  return { records: rows.map((r) => r.lead), errors, headers };
}
