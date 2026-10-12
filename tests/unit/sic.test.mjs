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
is("descriptions compared without case or punctuation", sicKey("Plumbing, Heating & Air-Conditioning") === sicKey("PLUMBING HEATING AIR CONDITIONING"), true);

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll SIC checks passed.");
