#!/usr/bin/env node
/** Unit tests for the CSV lead importer. */
import { parseCsv, rowsToImport, rowsToLeads, mapHeaders, mapAllHeaders, normalizeState, parseYears, parseDrivers, parseXmod, TEMPLATE_HEADERS, cleanValue, staffMatcher, dayAt, resultSpelling } from "../../src/lib/csv.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
};
const eq = (label, actual, expected) =>
  check(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}`);

// --- parser ----------------------------------------------------------------
eq("plain rows", parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]);

eq(
  "quoted field with a comma",
  parseCsv('Company,City\n"Acme, Inc.",Phoenix'),
  [["Company", "City"], ["Acme, Inc.", "Phoenix"]]
);

eq(
  "escaped quotes",
  parseCsv('name\n"He said ""hi"""'),
  [["name"], ['He said "hi"']]
);

eq(
  "embedded newline inside quotes",
  parseCsv('note\n"line one\nline two"'),
  [["note"], ["line one\nline two"]]
);

eq("CRLF line endings", parseCsv("a,b\r\n1,2\r\n"), [["a", "b"], ["1", "2"]]);

eq("blank lines skipped", parseCsv("a\n\n1\n\n"), [["a"], ["1"]]);

eq("trailing empty field kept", parseCsv("a,b\n1,"), [["a", "b"], ["1", ""]]);

// --- header mapping --------------------------------------------------------
eq(
  "header aliases resolve",
  mapHeaders(["Company Name", "Contact", "Phone #", "ST", "Zip Code", "Unknown Col"]),
  ["company_name", "contact_name", "phone", "state", "zip", null]
);

// --- row mapping -----------------------------------------------------------
{
  const rows = parseCsv(
    [
      "Company,Contact,Phone,City,State,Employees,Nonsense",
      'Acme Ltd,Jane Doe,(602) 555-0100,Phoenix,arizona,42,ignore me',
      ",Orphan Row,,,,,",                       // no company -> error
      '"Beta, LLC",John Roe,,Tucson,az,7,x',
    ].join("\n")
  );
  const { records, errors } = rowsToLeads(rows);

  check("rows without a company are counted as errors", errors === 1, `errors=${errors}`);
  check("valid rows are kept", records.length === 2, `records=${records.length}`);
  eq("first record maps correctly", records[0], {
    company_name: "Acme Ltd",
    contact_name: "Jane Doe",
    phone: "(602) 555-0100",
    city: "Phoenix",
    state: "AZ",
    employees: "42",
  });
  check("2-letter state passes through upper-cased", records[1].state === "AZ");
  check("quoted company name survives", records[1].company_name === "Beta, LLC");
  check("unmapped columns are dropped", !("Nonsense" in records[0]));
}

// --- state normalisation ---------------------------------------------------
eq("full state name maps to the right code", normalizeState("Arizona"), "AZ");
eq("full name is not truncated to a wrong state", normalizeState("arizona"), "AZ");
eq("two-letter code is upper-cased", normalizeState("az"), "AZ");
eq("multi-word state name", normalizeState("New Mexico"), "NM");
eq("unknown state is rejected", normalizeState("Freedonia"), null);
eq("invalid 2-letter code is rejected", normalizeState("ZZ"), null);
eq("empty state", normalizeState(""), null);

{
  const rows = parseCsv("Company,State\nAcme,Freedonia");
  const { records } = rowsToLeads(rows);
  check("unrecognised state is dropped, not stored wrong", !("state" in records[0]));
}

// --- edge cases ------------------------------------------------------------
eq("header-only file yields nothing", rowsToLeads(parseCsv("Company\n")).records, []);
eq("empty input", parseCsv(""), []);

// --- more ways to reach a name ------------------------------------------------
{
  const cols = mapHeaders(["Company", "Phone", "Mobile Phone", "Cell", "Email", "Decision Maker", "DM Phone", "DM Cell", "Decision Maker Email"]);
  check("mobile, DM phone, DM mobile and DM email headings land in their own columns",
    JSON.stringify(cols) === JSON.stringify(["company_name", "phone", "contact_mobile", "contact_mobile", "email", "decision_maker", "dm_phone", "dm_mobile", "dm_email"]), JSON.stringify(cols));
}

// --- years with the agency ------------------------------------------------------
check("years with the agency read as a whole number, or not at all",
  JSON.stringify(["5", "5 years", "12 yrs", "abc", "200"].map(parseYears)) === JSON.stringify([5, 5, 12, null, null]));
{
  const { rows } = rowsToImport([["Company", "Agency", "Years With Agency"], ["Acme Plumbing", "Garry Insurance", "6 years"]]);
  check("…and imported onto the name's coverage", rows[0]?.insurance?.agency_years === 6, JSON.stringify(rows[0]?.insurance));
}

// --- the import template ------------------------------------------------------------
{
  const read = mapAllHeaders(TEMPLATE_HEADERS);
  const missing = TEMPLATE_HEADERS.filter((h, i) => !read[i]);
  const cols = read.filter(Boolean).map((t) => t.column);
  check("every heading in the template is one the import reads, none twice", !missing.length && new Set(cols).size === cols.length, JSON.stringify(missing));
}

// --- what old lists put in empty fields ----------------------------------------------
check("“n/a”, “none”, “no site” and the like are read as blank",
  ["n/a", "N/A", "none", "No Site", "no email", "-", "unknown"].every((v) => cleanValue("website", v) === null && cleanValue("phone", v) === null));
check("a website is kept when it is a web address", JSON.stringify(["www.acme.com", "acme.com/about", "http://acme.co", "see notes"].map((v) => cleanValue("website", v)))
  === JSON.stringify(["www.acme.com", "acme.com/about", "http://acme.co", null]));
check("an email field keeps the first real address", JSON.stringify(["bob@acme.com; sue@acme.com", "bob at acme", "Sue@Acme.com"].map((v) => cleanValue("dm_email", v)))
  === JSON.stringify(["bob@acme.com", null, "Sue@Acme.com"]));
{
  const { rows } = rowsToImport([["Company", "Website", "Email", "City"], ["Acme Plumbing", "no site", "n/a", "Mesa"]]);
  check("…and an imported row leaves them empty", rows[0]?.lead?.website === undefined && rows[0]?.lead?.email === undefined && rows[0]?.lead?.city === "Mesa", JSON.stringify(rows[0]?.lead));
}

// Drivers and XMOD: numbers in the database, so anything else is left out rather than failing the import.
check("drivers read as a count", JSON.stringify(["8", "1,200", "", "eight", "-2"].map(parseDrivers)) === JSON.stringify([8, 1200, null, null, null]));
check("an XMOD read as written", JSON.stringify([".85", "0.85", "1.5", "1.50", "1", "0", "10", "1.234", "n/a"].map(parseXmod)) === JSON.stringify([0.85, 0.85, 1.5, 1.5, 1, null, null, null, null]));
{
  const { rows } = rowsToImport([["Company", "Drivers", "XMOD", "Autos"], ["Good Co", "6", ".92", "4"], ["Odd Co", "six", "high", "2"]]);
  check("…on import, beside Autos", rows[0]?.lead?.drivers === 6 && rows[0]?.lead?.xmod === 0.92 && rows[0]?.lead?.autos === "4", JSON.stringify(rows[0]?.lead));
  check("…and one that is not a number is left out, the row kept", rows[1]?.lead && !("drivers" in rows[1].lead) && !("xmod" in rows[1].lead), JSON.stringify(rows[1]?.lead));
  check("an E-Mod or Experience Mod column reads as the XMOD", mapAllHeaders(["E-Mod", "Experience Mod", "Number of Drivers"]).map((t) => t?.column).join(",") === "xmod,xmod,drivers");
}
check("the template has Drivers and XMOD after Autos, before Sales Volume",
  TEMPLATE_HEADERS.slice(TEMPLATE_HEADERS.indexOf("Autos"), TEMPLATE_HEADERS.indexOf("Autos") + 4).join(",") === "Autos,Drivers,XMOD,Sales Volume");

// The old system's history (Sean, Nov 2026): when a lead was developed and set, and by whom.
{
  const { rows } = rowsToImport([["Company", "Date Developed", "DBDev Manager", "Appt Create Date", "Set By", "Appointment Date"],
    ["Old Co", "3/14/2025", "Sean Fitzgerald", "04/02/2025", "Mike P", "4/20/2025"], ["New Co", "", "", "", "", ""]]);
  check("an old list's dates developed and set, and its managers, read on import",
    JSON.stringify(rows[0]?.history) === JSON.stringify({ developed_at: "2025-03-14", developed_by: "Sean Fitzgerald", set_at: "2025-04-02", set_by: "Mike P" }), JSON.stringify(rows[0]?.history));
  check("…none on a row without them", rows[1]?.history === null, JSON.stringify(rows[1]?.history));
  check("…the history columns aren't the lead's", !("developed_at" in (rows[0]?.lead ?? {})) && !("developed_by" in (rows[0]?.lead ?? {})));
  // The old system's own template: APPT_REP who set the appointment, its QA dates when developed and set. Not DBDV_REP: it
  // held "User 10" on the names its match tool added (Sean, Nov 2026).
  const old = rowsToImport([["CALLRESULT_DBDV", "CALLRESULT_APPT", "DBDV_REP", "APPT_REP", "COMPANYNAME", "APPOINTMENTDATE", "APPTCREATEDDATE", "QA_DATE_DBDV", "QA_DATE_APPT"],
    ["Appointment", "Appointment", "User 10", "Jen Bell", "Template Co", "5/20/2025", "", "3/14/2025", "4/02/2025"],
    ["Lead", "Lead-No Contact", "User 10", "", "Lead Only Co", "", "", "6/1/2024", ""]]).rows;
  check("the old template: APPT_REP who set it (DBDV_REP ignored), QA_DATE_DBDV and QA_DATE_APPT the dates developed and set",
    JSON.stringify(old[0]?.history) === JSON.stringify({ set_by: "Jen Bell", developed_at: "2025-03-14", set_at: "2025-04-02" }), JSON.stringify(old[0]?.history));
  check("…a lead with no appointment: developed only", JSON.stringify(old[1]?.history) === JSON.stringify({ developed_at: "2024-06-01" }), JSON.stringify(old[1]?.history));
  check("an old export's \\u0026 is an &", rowsToImport([["COMPANYNAME"], ["Dr Spray Paint U0026 Body"], ["A \\u0026 B"]]).rows.map((r) => r.lead.company_name).join("|") === "Dr Spray Paint & Body|A & B");
  check("LEADDATE: when the old system took the name on", rowsToImport([["COMPANYNAME", "LEADDATE"], ["Dated Co", "8/17/2023"]]).rows[0]?.lead.lead_date === "2023-08-17");
  const created = rowsToImport([["COMPANYNAME", "LEADDATE", "QA_DATE_DBDV"], ["Blank Co", "", "3/14/2025"], ["Both Co", "8/17/2023", "3/14/2025"]]).rows;
  check("…left empty (as the old system leaves it): QA_DATE_DBDV is when the lead was created", created[0]?.lead.lead_date === "2025-03-14" && created[1]?.lead.lead_date === "2023-08-17",
    JSON.stringify(created.map((r) => r.lead.lead_date)));
  check("…the QA dates kept on the lead too", old[0]?.lead.qa_date_dbdv === "2025-03-14" && old[0]?.lead.qa_date_appt === "2025-04-02");
  check("other spellings: Developed By, Date Set, Appt Setter", mapAllHeaders(["Developed By", "Date Set", "Appt Setter", "Lead Developed Date"]).map((t) => t?.column).join(",") === "developed_by,set_at,set_by,developed_at");
  const who = staffMatcher([{ id: 2, first_name: "Sean", last_name: "Fitzgerald", email: "sean@beacon.test" }, { id: 3, first_name: "Mike", last_name: "Preston", email: "mike@x.test" },
    { id: 9, first_name: "Sam", last_name: "Fox" }, { id: 10, first_name: "Sara", last_name: "Fox" }]);
  check("a manager found by full name, either way round, any case, by first name and initial, or email",
    JSON.stringify(["Sean Fitzgerald", "sean  fitzgerald", "Fitzgerald, Sean", "Mike P", "mike@x.test", "Nobody Here", ""].map(who)) === JSON.stringify([2, 2, 2, 3, 3, null, null]));
  check("…a short form two people share finds neither", who("S Fox") === null && who("Sam F") === 9);
  check("…the old system's team before the name (Appts-Mike Preston) taken off", who("Appts-Mike Preston") === 3 && who("DBDV - Sean Fitzgerald") === 2);
  check("a day given as noon in Arizona: the same day in every US time zone", dayAt("2025-03-14") === "2025-03-14T19:00:00Z" && dayAt(null) === null);
}

// --- Sean's messy test lists (Nov 2026) ---------------------------------------------
{
  const H = ["CompanyName", "Phone1", "Contact1", "Title1", "DecisionMaker", "DMTitle", "EMPLOYEES", "AUTOS", "LOCATIONS", "Zip", "Email", "Fax", "PKGCARRIER", "PKGXDATE", "WCCARRIER", "WCXDATE"];
  const one = (vals) => rowsToImport([H, H.map((h) => vals[h] ?? "")]).rows[0];
  let r = one({ CompanyName: "A", Phone1: "801-253-3672", Contact1: "Vinod Patel 361-550-1360 cell", Title1: "Controller", DecisionMaker: "Jay Faskas direct line 361-788-6210", DMTitle: "Owner ext.116" });
  eq("a cell in the contact's name: their mobile, the name alone", [r.lead.contact_name, r.lead.contact_mobile, r.lead.contact_phone ?? null], ["Vinod Patel", "361-550-1360", null]);
  eq("…a direct line in the DM's: their phone; an extension in the DM title, ignored once they have one", [r.lead.decision_maker, r.lead.dm_phone, r.lead.dm_title], ["Jay Faskas", "361-788-6210", "Owner"]);
  r = one({ CompanyName: "A", Phone1: "801-253-3672", Contact1: "Brent Sweet EXT 1", Title1: "cell 435-777-3006", DecisionMaker: "Shawn Arvey231-730-1776 (cell)", DMTitle: "1- 775-289-4473" });
  eq("an extension alone: the business's number with it", [r.lead.contact_name, r.lead.contact_phone], ["Brent Sweet", "801-253-3672 x1"]);
  eq("a title that was only a number is blank", [r.lead.contact_title ?? null, r.lead.contact_mobile], [null, "435-777-3006"]);
  eq("a number run into the name, and one with a 1 in front", [r.lead.decision_maker, r.lead.dm_mobile, r.lead.dm_phone, r.lead.dm_title ?? null], ["Shawn Arvey", "231-730-1776", "775-289-4473", null]);
  r = one({ CompanyName: "A", Phone1: "920-619-5040", Title1: "920-619-5040 cell", Contact1: "David Merill @ 801-857-6533" });
  eq("the business's own number in a title is just taken off; a dangling @ goes too", [r.lead.contact_title ?? null, r.lead.contact_mobile ?? null, r.lead.contact_name, r.lead.contact_phone], [null, null, "David Merill", "801-857-6533"]);
  r = one({ CompanyName: "A", Contact1: "Ann 602-555-0101 / 602-555-0102 / 602-555-0103" });
  check("a third number with nowhere to go is kept in the internal notes", /Other numbers: contact name: 602-555-0103/.test(r.notes?.internal_notes ?? "") && r.lead.contact_phone === "602-555-0101" && r.lead.contact_mobile === "602-555-0102", JSON.stringify([r.lead, r.notes]));
  eq("a company name is left alone", one({ CompanyName: "X-cell Construction 2 Llc", Phone1: "801-253-3672" }).lead.company_name, "X-cell Construction 2 Llc");

  r = one({ CompanyName: "A", EMPLOYEES: "15-Dec", AUTOS: "5-Jan", LOCATIONS: "4-Mar" });
  eq("a range Excel made a date is a range again", [r.lead.employees, r.lead.autos, r.lead.location], ["12-15", "1-5", "3-4"]);
  r = one({ CompanyName: "A", EMPLOYEES: "20+", AUTOS: "yes", LOCATIONS: "1 own" });
  eq("…a count as written kept; a word with no number in it left out", [r.lead.employees, r.lead.autos ?? null, r.lead.location], ["20+", null, "1 own"]);
  r = one({ CompanyName: "A", EMPLOYEES: "Drivers: 5" });
  eq("\"Drivers: 5\" in Employees: the drivers", [r.lead.employees ?? null, r.lead.drivers], [null, 5]);

  r = one({ CompanyName: "A", Zip: "789420632", Email: "info@the marketexpress.com", Fax: "did not say" });
  eq("a ZIP+4 without its dash; one email typed with a space; a fax that \"did not say\"", [r.lead.zip, r.lead.email, r.lead.fax ?? null], ["78942-0632", "info@themarketexpress.com", null]);
  eq("…the same ZIP twice; a full stop after an email; SEE NOTES", [one({ CompanyName: "A", Zip: "89030/89030", Email: "ej@rennoldsco.com.", Fax: "SEE NOTES" })].map((x) => [x.lead.zip, x.lead.email, x.lead.fax ?? null])[0], ["89030", "ej@rennoldsco.com", null]);
  check("…two emails: the first", one({ CompanyName: "A", Email: "todd@ceipave.com; jodie@ceipave.com" }).lead.email === "todd@ceipave.com");

  r = one({ CompanyName: "A", PKGCARRIER: "4/1/2026", WCCARRIER: "4/1/2026", WCXDATE: "7/1/2026" });
  eq("a date in a carrier field: the line's X-date, unless it has one", [r.insurance.pkg_carrier ?? null, r.insurance.pkg_xdate, r.insurance.wc_carrier ?? null, r.insurance.wc_xdate], [null, "2026-04-01", null, "2026-07-01"]);
}

// The old system's call counts (Sean, Nov 2026: "our Appt call results go from XD-Call 0 to XD-Call 20").
check("XD-Call 0 to XD-Call 20 all read as XD-Call 0 (Lead-No Contact)", Array.from({ length: 21 }, (_, i) => resultSpelling(`XD-Call ${i}`)).every((t) => t === "xd-call 0"));
check("…and Call 0 to Call 9 as Call 0 (Viable-CallBack), however spaced", ["Call 0", "Call 9", " call  15 ", "CALL 3"].every((t) => resultSpelling(t) === "call 0"));
check("…any other result as written, in lower case", resultSpelling("X-Date-Lead") === "x-date-lead" && resultSpelling("Callback") === "callback" && resultSpelling("Call Back") === "call back");

console.log(failures ? `\n${failures} test(s) failed.\n` : "\nAll CSV tests passed.\n");
process.exit(failures ? 1 : 0);
