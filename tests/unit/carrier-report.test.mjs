#!/usr/bin/env node
/** Unit tests for a carrier's report: a client's X-dates as a CSV (carrier-report.js; Sean, Nov 2026). */
import { LINE_LABELS, carrierLeadsCsv, usDate } from "../../src/lib/carrier-report.js";

let failures = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); failures++; }
};

is("dates as the old lists write them", [usDate("2027-03-01"), usDate(null)], ["03/01/2027", ""]);
is("every policy line named, the two the lead sheet leaves out too", [LINE_LABELS.wc, LINE_LABELS.homeowner, LINE_LABELS.personal_auto], ["Workers comp", "Homeowner", "Personal auto"]);
const csv = carrierLeadsCsv([
  { company: "Acme, Inc", city: "Phoenix", state: "AZ", zip: "85016", phone: "602-555-0100", project: "Capital_Appts", ultimate_xdate: "2027-03-01",
    lines: [{ key: "wc", xdate: "2027-03-01", carrier: "West Bend Ins Co", mine: true }, { key: "pkg", xdate: "2027-05-01", carrier: "Hartford", mine: false }], created: "2025-06-02" },
  { company: "Bare Co", city: null, state: "AZ", zip: null, phone: null, project: "Capital_Appts", ultimate_xdate: null, lines: [], created: "2026-11-04" },
]).split("\r\n");
is("the columns: the business, where, its project and renewal, a date and carrier for each line used (the lead sheet's order), when created", csv[0],
  "Business,City,ST,Zip,Phone,Project,Renewal,Liability / Package XDate,Liability / Package Carrier,Workers comp XDate,Workers comp Carrier,Date Lead Created");
is("…a lead a row", csv[1], '"Acme, Inc",Phoenix,AZ,85016,602-555-0100,Capital_Appts,03/01/2027,05/01/2027,Hartford,03/01/2027,West Bend Ins Co,06/02/2025');
is("…blanks left blank", csv[2], "Bare Co,,AZ,,,Capital_Appts,,,,,,11/04/2026");
is("none: the heading alone", carrierLeadsCsv([]), "Business,City,ST,Zip,Phone,Project,Renewal,Date Lead Created");

console.log(failures ? `\n${failures} check(s) failed.\n` : "\nAll carrier report checks passed.\n");
process.exit(failures ? 1 : 0);
