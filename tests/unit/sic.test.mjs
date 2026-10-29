#!/usr/bin/env node
/** Unit tests for reading a master list of SIC codes and descriptions. */
import { sicCode, sicKey, sicLookup, sicMatcher, sicPairsFromRows } from "../../src/lib/sic.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};
const is = (label, got, want) => check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

is("the old system's headings (SICCode, SICDesc)", sicPairsFromRows([["SICCode", "SICDesc"], ["1521-99", "New construction, single-family houses"], ["1711", "Plumbing"]]),
  [{ code: "152199", description: "New construction, single-family houses" }, { code: "1711", description: "Plumbing" }]);
is("the client's 6-digit sheet (PSIC, DESCRIPTION), its padding trimmed", sicPairsFromRows([["\ufeffPSIC", "DESCRIPTION"], ["011198", "WHEAT        "]]),
  [{ code: "011198", description: "WHEAT" }]);
is("…in any order, with other columns about", sicPairsFromRows([["Notes", "SIC Description", "SIC Code"], ["x", "Roofing", " 1761 "]]), [{ code: "1761", description: "Roofing" }]);
is("…blank and repeated codes dropped", sicPairsFromRows([["SIC Code", "SIC Description"], ["", "Nothing"], ["1711", "Plumbing"], ["1711", "Again"], ["n/a", "No"]]).map((p) => p.code), ["1711"]);
is("…no headings: code, then description", sicPairsFromRows([["1711", "Plumbing"]]), [{ code: "1711", description: "Plumbing" }]);
is("a code kept without spaces, and its dash", sicCode(" 1521 - 99 "), "152199");
// The leading zero a spreadsheet takes off the agricultural codes, put back (Sean, Oct 2026).
is("111 is 0111", sicCode("111"), "0111");
is("11101 is 011101", sicCode("11101"), "011101");
is("111-01 is 011101", sicCode("111-01"), "011101");
is("1 is 01", sicCode("1"), "01");
is("a whole code is left alone", sicCode("0111"), "0111");
is("…and a 6-digit one", sicCode("152101"), "152101");
is("…and SalesGenie's 4225-05 is the sheet's 422505", sicCode("7342-00"), "734200");
is("the codes a description is found under: its own, its industry's, its group's", sicLookup("4225-05"), ["422505", "4225", "42"]);
is("…a 4-digit code: its own and its group's", sicLookup("1711"), ["1711", "17"]);
is("a sheet's codes get their zero back", sicPairsFromRows([["SIC Code", "SIC Description"], ["111", "Wheat"], ["0112", "Rice"]]).map((p) => p.code).join(), "0111,0112");
is("descriptions compared without case or punctuation", sicKey("Plumbing, Heating & Air-Conditioning") === sicKey("PLUMBING HEATING AIR CONDITIONING"), true);

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
// A description alone finds its code (Oct 2026: the old system's records, matched against the client's new 2-, 4- and 6-digit lists).
const codeFor = sicMatcher([
  { code: "64", description: "INSURANCE AGENTS BROKERS & SERVICE" }, { code: "6411", description: "INSURANCE AGENTS BROKERS & SERVICE" },
  { code: "641198", description: "INSURANCE AGENTS BROKERS & SERVICE" }, { code: "641105", description: "INSURANCE" },
  { code: "2448", description: "WOOD PALLETS & SKIDS" }, { code: "2439", description: "STRUCTURAL WOOD MEMBERS NEC" },
  { code: "8331", description: "JOB TRAINING & VOCATIONAL REHAB SVCS" }, { code: "3536", description: "OVERHEAD TRAVELING CRANES & HOISTS" },
  { code: "3851", description: "OPHTHALMIC GOODS" }, { code: "5048", description: "OPHTHALMIC GOODS" },
  { code: "15", description: "BUILDING CNSTR-GENERAL CONTRACTORS & OPERATIVE BUILDERS" }, { code: "152103", description: "GENERAL CONTRACTORS" },
]);
is("& and \"and\" are one", codeFor("Wood Pallets and Skids"), "2448");
is("…and Not Elsewhere Classified is NEC", codeFor("Structural Wood Members, Not Elsewhere Classified"), "2439");
is("…and the list's short forms are the words", codeFor("Job Training and Vocational Rehabilitation Services"), "8331");
is("one description at several levels of an industry is its 4-digit code", codeFor("Insurance Agents, Brokers & Service"), "6411");
is("a description the list cut short is found by its start", codeFor("Overhead Traveling Cranes, Hoists, and Monorail Systems"), "3536");
is("…but not by a start too short to be one thing", codeFor("General Contractors-Industrial Buildings and Warehouses"), null);
is("a description of two industries is no code (a wrong one is worse)", codeFor("Ophthalmic Goods"), null);
is("…nor is one not on the list", codeFor("Offices & Clinics of Doctors of Medicine"), null);

console.log("\nAll SIC checks passed.");
