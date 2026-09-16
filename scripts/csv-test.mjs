#!/usr/bin/env node
/** Unit tests for the CSV lead importer. */
import { parseCsv, rowsToLeads, mapHeaders, normalizeState } from "../lib/csv.js";

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

console.log(failures ? `\n${failures} test(s) failed.\n` : "\nAll CSV tests passed.\n");
process.exit(failures ? 1 : 0);
