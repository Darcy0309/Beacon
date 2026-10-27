#!/usr/bin/env node
/** Unit tests for reading a master list of SIC codes and descriptions. */
import { sicCode, sicKey, sicPairsFromRows } from "../../src/lib/sic.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};
const is = (label, got, want) => check(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`);

is("the old system's headings (SICCode, SICDesc)", sicPairsFromRows([["SICCode", "SICDesc"], ["1521-99", "New construction, single-family houses"], ["1711", "Plumbing"]]),
  [{ code: "1521-99", description: "New construction, single-family houses" }, { code: "1711", description: "Plumbing" }]);
is("…in any order, with other columns about", sicPairsFromRows([["Notes", "SIC Description", "SIC Code"], ["x", "Roofing", " 1761 "]]), [{ code: "1761", description: "Roofing" }]);
is("…blank and repeated codes dropped", sicPairsFromRows([["SIC Code", "SIC Description"], ["", "Nothing"], ["1711", "Plumbing"], ["1711", "Again"], ["n/a", "No"]]).map((p) => p.code), ["1711"]);
is("…no headings: code, then description", sicPairsFromRows([["1711", "Plumbing"]]), [{ code: "1711", description: "Plumbing" }]);
is("a code kept without spaces", sicCode(" 1521 - 99 "), "1521-99");
// The leading zero a spreadsheet takes off the agricultural codes, put back (Sean, Oct 2026).
is("111 is 0111", sicCode("111"), "0111");
is("11101 is 011101", sicCode("11101"), "011101");
is("111-01 is 0111-01", sicCode("111-01"), "0111-01");
is("1 is 01", sicCode("1"), "01");
is("a whole code is left alone", sicCode("0111"), "0111");
is("…and a 6-digit one", sicCode("152101"), "152101");
is("…and one with its detail", sicCode("7342-00"), "7342-00");
is("a sheet's codes get their zero back", sicPairsFromRows([["SIC Code", "SIC Description"], ["111", "Wheat"], ["0112", "Rice"]]).map((p) => p.code).join(), "0111,0112");
is("descriptions compared without case or punctuation", sicKey("Plumbing, Heating & Air-Conditioning") === sicKey("PLUMBING HEATING AIR CONDITIONING"), true);

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll SIC checks passed.");
