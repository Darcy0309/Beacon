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

/** Rows back to CSV text, each value quoted when it holds a comma, a quote or a new line. */
export function csvText(rows) {
  const cell = (v) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

/**
 * The columns of a file the importer reads, and its rows without the rest:
 * a raw SalesGenie export carries some 200 columns and goes to the server
 * as the twenty-odd it uses. `skip` is the rows (indexes into csvRows) to
 * leave out. The heading row stays first.
 */
export function keepColumns(csvRows, skip = new Set()) {
  if (!csvRows.length) return [];
  const used = mapAllHeaders(csvRows[0]).flatMap((m, i) => (m ? [i] : []));
  return csvRows.filter((_, r) => !skip.has(r)).map((row) => used.map((i) => row[i] ?? ""));
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
  businessphone: "phone", officephone: "phone", workphone: "phone", contactphone: "phone",
  mobile: "contact_mobile", mobilephone: "contact_mobile", cell: "contact_mobile", cellphone: "contact_mobile",
  cellular: "contact_mobile", contactmobile: "contact_mobile", contactcell: "contact_mobile",
  fax: "fax", fax1: "fax",
  email: "email", emailaddress: "email", emailid: "email", contactemail: "email",
  dmphone: "dm_phone", decisionmakerphone: "dm_phone", dmbusinessphone: "dm_phone", dmofficephone: "dm_phone",
  dmmobile: "dm_mobile", dmcell: "dm_mobile", dmcellphone: "dm_mobile", decisionmakermobile: "dm_mobile", decisionmakercell: "dm_mobile",
  dmemail: "dm_email", decisionmakeremail: "dm_email",
  contact2: "contact2_name", contact2name: "contact2_name", secondarycontact: "contact2_name", secondcontact: "contact2_name",
  contact2title: "contact2_title", secondarycontacttitle: "contact2_title", title2: "contact2_title",
  contact2phone: "contact2_phone", secondarycontactphone: "contact2_phone",
  contact2mobile: "contact2_mobile", contact2cell: "contact2_mobile", secondarycontactmobile: "contact2_mobile", secondarycontactcell: "contact2_mobile",
  contact2email: "contact2_email", secondarycontactemail: "contact2_email", email2: "contact2_email",
  website: "website", web: "website", url: "website",

  // --- location -------------------------------------------------------
  address: "address", address1: "address", street: "address", streetaddress: "address",
  city: "city", state: "state", st: "state",
  zip: "zip", zipcode: "zip", postalcode: "zip",
  county: "county", territory: "territory",

  // --- firmographics --------------------------------------------------
  sic: "sic_code", siccode: "sic_code",
  // The SIC description fills in a missing code (or adds the pair to the SIC list) on import.
  sicdesc: "sic_description", sicdescription: "sic_description", siccodedescription: "sic_description",
  natureofbusiness: "description",
  description: "description",
  locations: "location", numberoflocations: "location",
  ein: "ein", fein: "ein", federalein: "ein", taxid: "ein", taxidnumber: "ein", federaltaxid: "ein",
  federaltaxidnumber: "ein", employeridentificationnumber: "ein", employerid: "ein", federalid: "ein",
  employees: "employees", numberofemployees: "employees", employeecount: "employees",
  coveredemployees: "covered_employees",
  professionals: "professionals", numberofprofessionals: "professionals",
  autos: "autos", vehicles: "autos", numberofautos: "autos",
  drivers: "drivers", numberofdrivers: "drivers", drivercount: "drivers",
  // The experience MOD on work comp: .85, 1.50.
  xmod: "xmod", emod: "xmod", expmod: "xmod", experiencemod: "xmod", experiencemodifier: "xmod", modrating: "xmod", wcmod: "xmod",
  salesvolume: "sales_volume", revenue: "sales_volume", annualrevenue: "sales_volume",
  // Everything else the lead page's business details hold (Sean, Nov 2026: "make the import/export template
  // include every field on the leads pages that we can input data on"), read as that form saves it.
  annualpayroll: "annual_payroll", payroll: "annual_payroll",
  buildingownlease: "location_ownership", buildingownership: "location_ownership", ownorlease: "location_ownership", ownlease: "location_ownership",
  buildingage: "building_age", buildingstories: "building_stories", stories: "building_stories",
  buildingacres: "building_acres", acres: "building_acres",
  fulltimeemployees: "employees_full_time", employeesfulltime: "employees_full_time", fulltime: "employees_full_time",
  parttimeemployees: "employees_part_time", employeesparttime: "employees_part_time", parttime: "employees_part_time",
  subcontractors: "subcontractors_pct", subcontractorspct: "subcontractors_pct", subcontractorspercent: "subcontractors_pct",
  vehicletypes: "auto_types", autotypes: "auto_types", kindsofvehicles: "auto_types",
  travelradius: "travel_radius", radius: "travel_radius",
  dotnumber: "dot_number", dot: "dot_number", usdot: "dot_number", usdotnumber: "dot_number",
  cargo: "cargo", cargotype: "cargo",
  claimslast3yrs: "claims_3yrs", claimslast3years: "claims_3yrs", claims3yrs: "claims_3yrs", claims: "claims_3yrs",
  // The contact's own line (the lead page's Contact Phone); a plain "Contact Phone" column stays the business's.
  contactdirectphone: "contact_phone", contactdirectline: "contact_phone", directphone: "contact_phone", directline: "contact_phone",
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
  // When the old system took the name on (Sean, Nov 2026: a carrier's report lists it); the day it's imported when not given.
  leaddate: "lead_date", datecreated: "lead_date", leadcreated: "lead_date",
  shoppingdate: "shopping_date",
  // A list's notes are the client's notes on the name; the old system's
  // "notes to client" column carries its call history, which is internal.
  notes: "client_note", note: "client_note", comments: "client_note",
  notesdcm: "client_note", notesdmc: "client_note", clientnotes: "client_note",
  notesclient: "internal_notes", notestoclient: "internal_notes", internalnotes: "internal_notes",

  // --- SalesGenie (Infogroup) exports, raw or trimmed (Oct 2026) ------
  // The business's own place (Location …), not its mailing address, which
  // can be a PO box in another town; the sales volume as a range, as the
  // client keeps it. EIN 1 is the business's first.
  phonenumbercombined: "phone", faxnumbercombined: "fax",
  locationaddress: "address", locationcity: "city", locationstate: "state",
  locationzipcode: "zip", locationzip: "zip",
  countydescription: "county", companywebsite: "website",
  locationemployeesizeactual: "employees", locationsalesvolumerange: "sales_volume",
  primarysiccode: "sic_code", primarysiccodedescription: "sic_description",
  ein1: "ein",
  executivetitle: "contact_title", executivetitle1: "contact2_title",
};

/**
 * A person written as a first and a last name in two columns: put together
 * into one name on import. SalesGenie's executive is the contact, its
 * First/Last Name 1 the second contact, and Name 2 another, kept in the
 * internal notes (a lead has room for two).
 */
export const NAME_PART_ALIASES = {
  firstname: "contact.first", lastname: "contact.last",
  contactfirstname: "contact.first", contactlastname: "contact.last",
  executivefirstname: "contact.first", executivelastname: "contact.last",
  firstname1: "contact2.first", lastname1: "contact2.last",
  firstname2: "other.first", lastname2: "other.last", executivetitle2: "other.title",
};

/**
 * The headings of the import template, in the order of a lead sheet: one of
 * the names each column is read by (any other spelling in COLUMN_ALIASES or
 * INSURANCE_ALIASES works too; columns may come in any order, and any left
 * out are simply blank). Company is the only one required.
 */
export const TEMPLATE_HEADERS = [
  "Company", "Contact", "Contact Title", "Phone", "Contact Direct Phone", "Mobile Phone", "Email", "Fax", "Website",
  "Decision Maker", "DM Title", "DM Phone", "DM Cell", "DM Email",
  "Contact 2", "Contact 2 Title", "Contact 2 Phone", "Contact 2 Mobile", "Contact 2 Email",
  "Address", "City", "State", "Zip", "County", "Territory",
  "SIC Code", "SIC Description", "Description",
  "Employees", "Full-Time Employees", "Part-Time Employees", "Subcontractors %",
  "Autos", "Drivers", "XMOD", "Sales Volume", "Annual Payroll",
  "Vehicle Types", "Travel Radius", "DOT Number", "Cargo",
  "Locations", "Building Own/Lease", "Building Age", "Building Stories", "Building Acres",
  "EIN", "Years In Business", "Estimated Annual Premium", "Claims Last 3 Yrs", "Professionals", "Covered Employees",
  "Producer Name", "List Source",
  "Ultimate XDate", "Package XDate", "Package Carrier", "Work Comp XDate", "Work Comp Carrier",
  "Auto XDate", "Auto Carrier", "Health XDate", "Health Carrier", "Personal Lines XDate", "Personal Lines Carrier", "Dental XDate", "Dental Provider",
  "Vision XDate", "Vision Provider", "Prof Liab XDate", "Prof Liab Carrier", "DO XDate", "DO Carrier",
  "EO XDate", "EO Carrier", "Agency Name", "Years With Agency",
  "Call Result DBDV", "Call Result Appt", "Appointment Date", "Appointment Time",
  "Notes", "Internal Notes",
];

/**
 * The largest lead list the importer takes, in MB. The file goes to the
 * server in one request: Vercel refuses a request body over 4.5 MB before the
 * app sees it, and next.config.mjs raises the server-action limit (1 MB by
 * default) to match. This leaves room under both for the form's own bytes.
 */
export const MAX_IMPORT_MB = 4;
/**
 * The largest file chosen to import, in MB: read in the browser, which sends
 * only the columns and rows imported (a raw SalesGenie export is mostly
 * columns the import doesn't use), so that part stays under MAX_IMPORT_MB.
 */
export const MAX_SOURCE_MB = 60;

/** Columns that belong on the lead's insurance_details row. */
export const INSURANCE_ALIASES = {
  agencyname: "agency_name", agency: "agency_name", currentcarrier: "agency_name",
  yearswithagency: "agency_years", agencyyears: "agency_years", yearsatagency: "agency_years", yearswithcarrier: "agency_years",
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
  personallinesxdate: "personal_lines_xdate", personallinescarrier: "personal_lines_carrier",
};

/** Columns that describe a booked appointment rather than the lead. */
export const APPOINTMENT_ALIASES = {
  appointmentdate: "appt_date", apptdate: "appt_date",
  appointmenttime: "appt_time", appttime: "appt_time",
};

/**
 * The old system's record of who did what when (Sean, Nov 2026: so the reports
 * count migrated leads and appointments in the months they were developed and
 * set): when a lead was developed and by whom, when its appointment was set
 * and by whom. The names are matched to our managers on import.
 */
export const HISTORY_ALIASES = {
  datedeveloped: "developed_at", developeddate: "developed_at", developedon: "developed_at", leaddeveloped: "developed_at",
  leaddevelopeddate: "developed_at", datepromoted: "developed_at", promoteddate: "developed_at", leadcreatedate: "developed_at", leadcreateddate: "developed_at",
  developedby: "developed_by", dbdvmanager: "developed_by", dbdevmanager: "developed_by", dbdvuser: "developed_by", dbdevuser: "developed_by",
  // Not the old system's DBDV_REP: it held "User 10" on the names its match tool added, not who developed a lead (Sean, Nov 2026).
  leadmanager: "developed_by", manager: "developed_by", accountmanager: "developed_by",
  apptcreatedate: "set_at", apptcreateddate: "set_at", appointmentcreatedate: "set_at", appointmentcreateddate: "set_at", appointmentcreated: "set_at",
  apptsetdate: "set_at", appointmentsetdate: "set_at", dateset: "set_at", apptdateset: "set_at",
  setby: "set_by", apptrep: "set_by", apptsetby: "set_by", appointmentsetby: "set_by", setter: "set_by", apptsetter: "set_by", apptmanager: "set_by", apptuser: "set_by",
};

/**
 * Finds our staff by the names an old export writes ("Sean Fitzgerald", "sean fitzgerald",
 * "Sean F", "Fitzgerald, Sean", or an email): their id, or null. A short form two people
 * share ("Sean F" for two Seans F.) finds neither.
 */
export function staffMatcher(users) {
  const index = new Map();
  const clash = new Set();
  const key = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9@.]+/g, " ").trim();
  const put = (k, id) => {
    if (!k) return;
    if (index.has(k) && index.get(k) !== id) clash.add(k);
    else index.set(k, id);
  };
  for (const u of users ?? []) {
    const first = key(u.first_name), last = key(u.last_name);
    put(key(`${first} ${last}`), u.id);
    put(key(`${last} ${first}`), u.id);
    if (first && last) put(`${first} ${last[0]}`, u.id);
    put(key(u.email), u.id);
  }
  return (name) => {
    // The old system's appointment setters carry their team before the name ("Appts-David Bishop", Nov 2026).
    const k = key(String(name ?? "").replace(/^\s*(appts?|appointments?|dbdv|dbdev|xd)\s*[-:]\s*/i, ""));
    return k && !clash.has(k) ? index.get(k) ?? null : null;
  };
}

/**
 * A call result as the import looks it up: lower case, one space between words. "Call 3" and "XD-Call 14" are the
 * old system's count of calls with no answer yet (DB Dev's Call 0 to 9, appointments' XD-Call 0 to 20; Sean,
 * Nov 2026), so any count reads as its "Call 0" / "XD-Call 0": Viable-CallBack and Lead-No Contact.
 */
export const resultSpelling = (text) => String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ")
  .replace(/^(xd-?\s?)?call ?#?\d+$/, (_, xd) => `${xd ? "xd-" : ""}call 0`);

/** A day the old system gives (2025-03-14) as a moment: noon in Arizona, the same day in every US time zone. */
export const dayAt = (day) => (day ? `${day}T19:00:00Z` : null);

/** Date columns, wherever they live — these need parsing rather than copying. */
const DATE_COLUMNS = new Set([
  "qa_date_dbdv", "qa_date_appt", "shopping_date", "appt_date",
  "ultimate_xdate", "pkg_xdate", "wc_xdate", "auto_xdate", "health_xdate",
  "dental_xdate", "vision_xdate", "prof_liab_xdate", "do_xdate", "eo_xdate",
  "homeowner_xdate", "personal_auto_xdate", "personal_lines_xdate", "developed_at", "set_at", "lead_date",
]);

// What old lists put in a field that has nothing in it: read as blank.
const PLACEHOLDERS = new Set(["n/a", "na", "n.a.", "none", "null", "nil", "unknown", "unk", "tbd", "-", "--", "---", ".", "?", "x",
  "no", "no site", "no website", "no web site", "nosite", "no web", "no email", "no e-mail", "noemail", "no email address",
  "not available", "not listed", "none listed", "no info", "same", "n\\a",
  // …and what the old system's callers wrote when a business wouldn't say (Sean's test lists, Nov 2026).
  "did not say", "didn't say", "declined", "decline", "declined to give", "none given", "not given", "see notes", "see note",
  "see e-mail", "see email", "e-mail"]);
const EMAIL_COLUMNS = new Set(["email", "dm_email", "contact2_email"]);
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;
const WEBSITE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i;

/**
 * A text value as it should be kept, or null for nothing: a placeholder
 * ("n/a", "no site", "none", "declined", "see notes..") is blank; an email field keeps the first
 * address that is one; a website field keeps what is a web address.
 */
export function cleanValue(column, value) {
  const v = String(value ?? "").trim();
  if (!v || PLACEHOLDERS.has(v.toLowerCase()) || PLACEHOLDERS.has(v.toLowerCase().replace(/[\s.]+$/, ""))) return null;
  if (EMAIL_COLUMNS.has(column)) {
    // One address typed with a space in it ("info@the marketexpress.com") or a full stop after it.
    const one = (v.match(/@/g) ?? []).length === 1 && !/[,;/]/.test(v) ? v.replace(/\s+/g, "") : v;
    return one.split(/[\s,;]+/).map((x) => x.replace(/\.+$/, "")).find((x) => EMAIL.test(x)) ?? null;
  }
  if (column === "website") return WEBSITE.test(v.replace(/^www\./i, "www.")) ? v : null;
  return v;
}

/** "5", "5 years", "12 yrs" -> a whole number of years (0-150), or null. */
export function parseYears(value) {
  const m = /^\s*(\d{1,3})(\s*(years?|yrs?)\.?)?\s*$/i.exec(String(value ?? ""));
  return m && Number(m[1]) <= 150 ? Number(m[1]) : null;
}

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
// The lead's internal notes live apart from it (lead_notes, staff only).
const NOTE_COLUMNS = new Set(["internal_notes"]);

export function mapAllHeaders(headerRow) {
  return headerRow.map((h) => {
    const key = norm(h);
    if (NOTE_COLUMNS.has(COLUMN_ALIASES[key])) return { table: "notes", column: COLUMN_ALIASES[key] };
    if (COLUMN_ALIASES[key]) return { table: "lead", column: COLUMN_ALIASES[key] };
    if (INSURANCE_ALIASES[key]) return { table: "insurance", column: INSURANCE_ALIASES[key] };
    if (APPOINTMENT_ALIASES[key]) return { table: "appointment", column: APPOINTMENT_ALIASES[key] };
    if (NAME_PART_ALIASES[key]) return { table: "name", column: NAME_PART_ALIASES[key] };
    if (HISTORY_ALIASES[key]) return { table: "history", column: HISTORY_ALIASES[key] };
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
 * An EIN (federal employer identification number) as it is written:
 * "12-3456789". Returns null for anything that is not nine digits; a
 * spreadsheet that dropped the leading zero ("23456789") gets it back.
 */
export function normalizeEin(value) {
  if (value == null) return null;
  let digits = String(value).replace(/\D/g, "");
  if (digits.length === 8) digits = `0${digits}`;
  return digits.length === 9 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : null;
}

/** "8" or "1,200" drivers -> a whole number (0-100,000), or null. */
export function parseDrivers(value) {
  const s = String(value ?? "").replace(/[\s,]/g, "");
  return /^\d{1,6}$/.test(s) && Number(s) <= 100000 ? Number(s) : null;
}

/**
 * An XMOD as written (".85", "1.5", "1.50") -> a number over 0 and under 10,
 * to two places, or null for anything else.
 */
export function parseXmod(value) {
  const s = String(value ?? "").trim();
  if (!/^(\d?\.\d{1,2}|\d(\.\d{0,2})?)$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n < 10 ? n : null;
}

// A phone number written into a person's name or title (Sean, Nov 2026: "cell #s in the title or contact fields"):
// "Vinod Patel 361-550-1360 cell", "cell 435-777-3006", "Shawn Arvey231-730-1776 (cell)", "1- 775-289-4473",
// with what labels it ("cell", "direct line", "office #") and an extension after it.
const PHONE_LABEL = String.raw`(?:cell(?:\s*(?:phone|#))?|mobile|direct(?:\s+line)?|home(?:\s*\/\s*direct)?(?:\s*#)?|office(?:\s*#)?|loc|ph|phone|c)`;
const PHONE_IN_TEXT = new RegExp(String.raw`(?:\(?\b${PHONE_LABEL}\)?\s*[:#]?\s*)?(?<!\d)(?:\+?1[\s.-]*)?\(?(\d{3})\)?[\s.-]*(\d{3})[\s.-]*(\d{4})(?!\d)(?:\s*(?:ext|x)\.?\s*(\d{1,5}))?(?:\s*\(?\s*${PHONE_LABEL}\b(?:\s*#)?\s*\)?)?`, "gi");
const MOBILE_LABEL = /\b(cell|mobile)\b|\bc\b\s*:?\s*\(?\d/i;
// An extension alone, off the business's own number: "Brent Sweet EXT 1", "CFO ext.116", "Lori Robbins x221".
const EXT_IN_TEXT = /\b(?:ext|x)\.?\s*(\d{1,5})(?!\d)/i;
// The people a row names and where each one's numbers go: the office line, then the cell.
const PERSON_PHONES = [
  ["contact_name", "contact_phone", "contact_mobile"], ["contact_title", "contact_phone", "contact_mobile"],
  ["decision_maker", "dm_phone", "dm_mobile"], ["dm_title", "dm_phone", "dm_mobile"],
  ["contact2_name", "contact2_phone", "contact2_mobile"], ["contact2_title", "contact2_phone", "contact2_mobile"],
];
const digitsOf = (v) => String(v ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
/** What is left of a name or title once its number is out: no dangling "-", "@", "*" or empty "()". */
const tidyText = (v) => v.replace(/\(\s*\)/g, " ").replace(/\s{2,}/g, " ").replace(/^[\s\-–:@*#,/]+|[\s\-–:@*#,/(]+$/g, "").trim();

/**
 * The numbers written into a row's names and titles, moved to the phone fields of that person (the contact's,
 * the decision maker's): a cell as their mobile, any other as their phone, an extension alone as the
 * business's number with it ("801-253-3672 x1"). A number with nowhere free to go is kept in the internal
 * notes, and one that is the business's own number is just taken off. A name or title that was only a
 * number is blank.
 */
function movePhones(lead, notes) {
  const business = digitsOf(lead.phone);
  const extra = [];
  for (const [field, office, cell] of PERSON_PHONES) {
    const text = lead[field];
    if (!text || !/\d/.test(text)) continue;
    let rest = text;
    let found = false;
    rest = rest.replace(PHONE_IN_TEXT, (whole, a, b, c, ext) => {
      found = true;
      const number = `${a}-${b}-${c}${ext ? ` x${ext}` : ""}`;
      if (`${a}${b}${c}` === business && !ext) return " ";
      const slot = MOBILE_LABEL.test(whole) ? cell : office;
      const other = slot === cell ? office : cell;
      if (!lead[slot] || digitsOf(lead[slot]) === digitsOf(number)) lead[slot] = number;
      else if (!lead[other]) lead[other] = number;
      else extra.push(`${field.replace(/_/g, " ")}: ${whole.trim()}`);
      return " ";
    });
    if (!found && business.length === 10 && EXT_IN_TEXT.test(rest)) {
      const ext = EXT_IN_TEXT.exec(rest)[1];
      if (!lead[office]) lead[office] = `${business.slice(0, 3)}-${business.slice(3, 6)}-${business.slice(6)} x${ext}`;
      else extra.push(`${field.replace(/_/g, " ")}: ext ${ext}`);
      rest = rest.replace(EXT_IN_TEXT, " ");
      found = true;
    }
    if (!found) continue;
    const left = tidyText(rest);
    if (left) lead[field] = left;
    else delete lead[field];
  }
  if (extra.length) {
    const line = `Other numbers: ${extra.join("; ")}`;
    notes.internal_notes = notes.internal_notes ? `${notes.internal_notes}\n${line}` : line;
  }
}

const MONTH = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
// Counts the lead keeps as written ("20+", "2 to 3", "1 own"), apart from what isn't one.
const COUNT_COLUMNS = ["employees", "covered_employees", "autos", "location", "professionals", "years_in_business"];
/**
 * A count as the lead keeps it: a range Excel turned into a date put back ("15-Dec" was 12-15, "5-Jan" 1-5),
 * a word with no number in it ("yes", "lots", "multi", "see notes") left out. Anything else as written.
 */
export function cleanCount(value) {
  const v = String(value ?? "").trim();
  const dayFirst = /^(\d{1,2})[-/ ]([a-z]{3})$/i.exec(v);
  const monthFirst = /^([a-z]{3})[-/ ](\d{1,2})$/i.exec(v);
  const [day, mon] = dayFirst ? [dayFirst[1], dayFirst[2]] : monthFirst ? [monthFirst[2], monthFirst[1]] : [];
  const month = mon && MONTH[mon.toLowerCase()];
  if (month) {
    const [lo, hi] = [month, Number(day)].sort((x, y) => x - y);
    return `${lo}-${hi}`;
  }
  return /\d/.test(v) ? v : null;
}

// A carrier column holding a date (Sean, Nov 2026: "dates in the carrier fields"): the date is the line's X-date.
const CARRIER_XDATE = {
  pkg_carrier: "pkg_xdate", wc_carrier: "wc_xdate", auto_carrier: "auto_xdate", health_carrier: "health_xdate",
  dental_provider: "dental_xdate", vision_provider: "vision_xdate", prof_liab_carrier: "prof_liab_xdate",
  do_carrier: "do_xdate", eo_carrier: "eo_xdate", homeowner_carrier: "homeowner_xdate", personal_auto_carrier: "personal_auto_xdate",
};

/**
 * Turn parsed CSV rows into the records each row can produce: the lead, its
 * insurance detail, a booked appointment, and its internal notes. Rows without a company name
 * are counted as errors rather than imported.
 *
 * Returns { rows, errors, headers } where headers lists the lead columns
 * recognised, and each row is { lead, insurance, appointment, notes, status,
 * contacts, row }: how many people it names, and its index in csvRows.
 */
// The kinds of vehicle and travel radii the lead page offers (lib/business.js), as an import reads them.
const VEHICLE_KINDS = [["cars", /^cars?$/], ["vans", /^vans?$/], ["delivery_trucks", /^delivery( trucks?)?$/],
  ["big_rigs", /^(big rigs?|semis?|tractor trailers?)$/], ["tow_trucks", /^(tow trucks?|wreckers?|tow trucks? \/ wreckers?)$/]];
const RADII = ["25", "50", "100", "250", "300", "500+"];

/**
 * The business details beyond the template's first columns (Nov 2026), as the lead page's form saves them: whole
 * numbers, acres and a percent, Own or Lease, Yes or No, the kinds of vehicle and a travel radius from its lists.
 * One that is none of those is left out (the row kept), so a stray value never fails the batch.
 */
export function businessDetails(lead) {
  const whole = (v) => (/^\d{1,6}$/.test(String(v).replace(/[,\s]/g, "")) ? Number(String(v).replace(/[,\s]/g, "")) : null);
  const decimal = (v, max) => {
    const n = Number(String(v).replace(/[%,\s]/g, ""));
    return String(v).trim() && Number.isFinite(n) && n >= 0 && n <= max ? n : null;
  };
  const set = (column, value) => { if (value === null || value === undefined) delete lead[column]; else lead[column] = value; };
  for (const c of ["building_age", "building_stories", "employees_full_time", "employees_part_time"]) if (c in lead) set(c, whole(lead[c]));
  if ("building_acres" in lead) set("building_acres", decimal(lead.building_acres, 99999999));
  if ("subcontractors_pct" in lead) set("subcontractors_pct", decimal(lead.subcontractors_pct, 100));
  if ("location_ownership" in lead) {
    const v = String(lead.location_ownership).trim().toLowerCase();
    set("location_ownership", /^own(ed|er|s)?$/.test(v) ? "own" : /^(lease[ds]?|rent(s|ed)?)$/.test(v) ? "lease" : null);
  }
  if ("claims_3yrs" in lead) {
    const v = String(lead.claims_3yrs).trim().toLowerCase();
    set("claims_3yrs", /^(y|yes|true|1)$/.test(v) ? true : /^(n|no|none|false|0)$/.test(v) ? false : null);
  }
  if ("auto_types" in lead) {
    const kinds = String(lead.auto_types).toLowerCase().split(/\s*[,;|]\s*/).map((t) => t.replace(/_/g, " ").trim()).filter(Boolean)
      .map((t) => VEHICLE_KINDS.find(([key, re]) => key.replace(/_/g, " ") === t || re.test(t))?.[0]).filter(Boolean);
    set("auto_types", kinds.length ? [...new Set(kinds)] : null);
  }
  if ("travel_radius" in lead) {
    const v = String(lead.travel_radius).toLowerCase().replace(/miles?|mi\.?/g, "").replace(/\s/g, "");
    set("travel_radius", RADII.includes(v) ? v : /^500\+?$|^over500$/.test(v) ? "500+" : null);
  }
  if ("dot_number" in lead) set("dot_number", String(lead.dot_number).replace(/^(us)?dot#?\s*/i, "").trim().slice(0, 14) || null);
}

export function rowsToImport(csvRows) {
  if (csvRows.length < 2) return { rows: [], errors: 0, headers: [] };

  const resolved = mapAllHeaders(csvRows[0]);
  const rows = [];
  let errors = 0;

  for (let r = 1; r < csvRows.length; r++) {
    const raw = csvRows[r];
    const lead = {};
    const insurance = {};
    const appointment = {};
    const notes = {};
    const parts = {};
    const history = {};

    resolved.forEach((target, i) => {
      if (!target) return;
      // An exported value that would open as a formula carries an apostrophe before it (lead-export.js): taken off here.
      // …and an "&" an old export wrote as its code ("Dr Spray Paint U0026 Body", Nov 2026) is an "&" again.
      const value = (raw[i] ?? "").trim().replace(/^'(?=[=+\-@])/, "").replace(/\\?u0026/gi, "&");
      if (!value) return;
      if (target.table === "name") {
        const v = cleanValue(target.column, value);
        if (v !== null) parts[target.column] = v;
        return;
      }

      const parsed = DATE_COLUMNS.has(target.column)
        ? parseDate(value)
        : target.column === "appt_time"
          ? parseTime(value)
          : target.column === "agency_years"
            ? parseYears(value)
            : cleanValue(target.column, value);
      if (parsed === null) return;

      if (target.table === "lead") lead[target.column] = parsed;
      else if (target.table === "notes") notes[target.column] = parsed;
      else if (target.table === "insurance") insurance[target.column] = parsed;
      else if (target.table === "history") history[target.column] = parsed;
      else appointment[target.column] = parsed;
    });

    // First and last names in their own columns: one name (a Contact column, when there is one, wins).
    const person = (who) => [parts[`${who}.first`], parts[`${who}.last`]].filter(Boolean).join(" ") || null;
    if (!lead.contact_name && person("contact")) lead.contact_name = person("contact");
    if (!lead.contact2_name && person("contact2")) lead.contact2_name = person("contact2");
    const other = person("other");
    if (other) {
      const line = `Other contact: ${[other, parts["other.title"]].filter(Boolean).join(", ")}`;
      notes.internal_notes = notes.internal_notes ? `${notes.internal_notes}\n${line}` : line;
    }

    if (!lead.company_name) {
      errors++;
      continue;
    }
    // The old system's template (Sean, Nov 2026): its QA dates are when the lead was developed
    // (QA_DATE_DBDV) and its appointment set (QA_DATE_APPT); kept on the lead as well.
    if (lead.qa_date_dbdv) history.developed_at ??= lead.qa_date_dbdv;
    // …and QA_DATE_DBDV is when the lead was created too: the old system leaves LEADDATE empty (Sean, Nov 2026).
    if (lead.qa_date_dbdv && !lead.lead_date) lead.lead_date = lead.qa_date_dbdv;
    if (lead.qa_date_appt) history.set_at = lead.qa_date_appt;
    if (lead.state) {
      const code = normalizeState(lead.state);
      // Drop an unrecognised state rather than storing a wrong one; the column
      // is only 2 characters wide.
      if (code) lead.state = code;
      else delete lead.state;
    }
    if (lead.ein) {
      // Like a state: a number that is not an EIN is left out, not stored wrong.
      const ein = normalizeEin(lead.ein);
      if (ein) lead.ein = ein;
      else delete lead.ein;
    }
    // "Drivers: 2" written in Employees: the drivers.
    const drivers = /^drivers?\s*[:=-]?\s*(\d{1,6})$/i.exec(lead.employees ?? "");
    if (drivers) {
      lead.drivers ??= drivers[1];
      delete lead.employees;
    }
    for (const column of COUNT_COLUMNS) {
      if (!(column in lead)) continue;
      const v = cleanCount(lead[column]);
      if (v === null) delete lead[column];
      else lead[column] = v;
    }
    movePhones(lead, notes);
    // A ZIP+4 written without its dash, or the same ZIP twice ("89030/89030").
    if (lead.zip) lead.zip = lead.zip.replace(/^(\d{5})(\d{4})$/, "$1-$2").replace(/^(\d{5}(?:-\d{4})?)\s*[/,;]\s*\d{5}(?:-\d{4})?$/, "$1");
    for (const [carrier, xdate] of Object.entries(CARRIER_XDATE)) {
      const day = insurance[carrier] && parseDate(insurance[carrier]);
      if (!day) continue;
      insurance[xdate] ??= day;
      delete insurance[carrier];
    }
    businessDetails(lead);
    // Numbers in the database: one that is not a count or an XMOD is left out, or the whole batch would fail.
    for (const [column, parse] of [["drivers", parseDrivers], ["xmod", parseXmod]]) {
      if (!(column in lead)) continue;
      const v = parse(lead[column]);
      if (v === null) delete lead[column];
      else lead[column] = v;
    }

    rows.push({
      lead,
      insurance: Object.keys(insurance).length ? insurance : null,
      notes: Object.keys(notes).length ? notes : null,
      // When the old system says it was developed and set, and by whom.
      history: Object.keys(history).length ? history : null,
      // A time with no date is not a booking.
      appointment: appointment.appt_date ? appointment : null,
      status: statusFromCallResults(lead.call_result_dbdv, lead.call_result_appt),
      // The people the row names: which of several records of one business to keep (dedupe.js).
      contacts: new Set([lead.contact_name, lead.contact2_name, lead.decision_maker, other].filter(Boolean).map((v) => v.toLowerCase())).size,
      // Its row in the parsed file, to rebuild the file with only the rows kept.
      row: r,
    });
  }

  return {
    rows,
    errors,
    headers: [...new Set(resolved.flatMap((t) => (t?.table === "lead" ? [t.column] : t?.table === "name" && !t.column.startsWith("other.") ? [`${t.column.split(".")[0]}_name`] : [])))],
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
