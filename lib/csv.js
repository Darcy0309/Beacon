// CSV parsing and column mapping for the lead importer (legacy Imports module).

/** Minimal RFC-4180 parser — handles quoted fields, embedded commas and newlines. */
export function parseCsv(text) {
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

// Maps common spreadsheet headings onto lead columns.
export const COLUMN_ALIASES = {
  company: "company_name", companyname: "company_name", business: "company_name",
  businessname: "company_name", account: "company_name", accountname: "company_name",
  contact: "contact_name", contactname: "contact_name", name: "contact_name",
  decisionmaker: "contact_name", fullname: "contact_name",
  title: "contact_title", contacttitle: "contact_title", jobtitle: "contact_title",
  phone: "phone", phone1: "phone", phonenumber: "phone", telephone: "phone", tel: "phone",
  email: "email", emailaddress: "email", emailid: "email",
  website: "website", web: "website", url: "website",
  address: "address", address1: "address", street: "address", streetaddress: "address",
  city: "city", state: "state", st: "state",
  zip: "zip", zipcode: "zip", postalcode: "zip",
  county: "county", territory: "territory",
  sic: "sic_code", siccode: "sic_code",
  employees: "employees", numberofemployees: "employees", employeecount: "employees",
  coveredemployees: "covered_employees",
  autos: "autos", vehicles: "autos", numberofautos: "autos",
  salesvolume: "sales_volume", revenue: "sales_volume", annualrevenue: "sales_volume",
  yearsinbusiness: "years_in_business", yrsinbusiness: "years_in_business",
  premium: "estimated_annual_premium", estimatedannualpremium: "estimated_annual_premium",
  producer: "producer_name", producername: "producer_name",
  broker: "broker",
  notes: "notes_dcm", note: "notes_dcm", comments: "notes_dcm",
  listsource: "list_source", source: "list_source",
  description: "description",
};

/** Resolve a header row to lead column names (null where unrecognised). */
export function mapHeaders(headerRow) {
  return headerRow.map((h) => COLUMN_ALIASES[norm(h)] ?? null);
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
 * Turn parsed CSV rows into lead records.
 * Returns { records, errors } — rows without a company name count as errors.
 */
export function rowsToLeads(rows) {
  if (rows.length < 2) return { records: [], errors: 0, headers: [] };

  const headers = mapHeaders(rows[0]);
  const records = [];
  let errors = 0;

  for (const raw of rows.slice(1)) {
    const rec = {};
    headers.forEach((col, i) => {
      if (!col) return;
      const v = (raw[i] ?? "").trim();
      if (v) rec[col] = v;
    });
    if (!rec.company_name) {
      errors++;
      continue;
    }
    if (rec.state) {
      const code = normalizeState(rec.state);
      // Drop an unrecognised state rather than storing a wrong one; the column
      // is only 2 characters wide.
      if (code) rec.state = code;
      else delete rec.state;
    }
    records.push(rec);
  }

  return { records, errors, headers };
}
