#!/usr/bin/env node
/** Unit tests for the search word rules: how a search box's text becomes the words every search matches. */
import { digitsOf, matchesAll, searchDoc, searchWords, wordForms } from "../../src/lib/search-words.js";

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

// --- words -------------------------------------------------------------------
eq("words, lowercased", searchWords("Sean Fitzgerald"), ["sean", "fitzgerald"]);
eq("a comma separates, it is not part of a word", searchWords("Drain, LLC"), ["drain", "llc"]);
eq(
  "a company name with punctuation",
  searchWords("AZ Pro Plumbing and Drain, LLC"),
  ["az", "pro", "plumbing", "and", "drain", "llc"]
);
eq("brackets, quotes and semicolons drop out", searchWords(`"Acme" (Phoenix); [x] {y}`), ["acme", "phoenix", "x", "y"]);
eq("a backslash separates", searchWords("acme\\phoenix"), ["acme", "phoenix"]);
eq("extra spaces collapse", searchWords("  acme   \t phoenix  "), ["acme", "phoenix"]);
eq("nothing typed", searchWords(""), []);
eq("null and undefined", [searchWords(null), searchWords(undefined)], [[], []]);
eq("only punctuation", searchWords(" , ; () "), []);
eq("at most eight words", searchWords("a b c d e f g h i j").length, 8);
eq("an email stays one word", searchWords("Mike@Beacon.test"), ["mike@beacon.test"]);

// --- numbers -----------------------------------------------------------------
eq("a phone with brackets and a dash", searchWords("(602) 851-8511"), ["602", "851-8511"]);
eq("a +1 country code is dropped", searchWords("+1 (602) 851-8511"), ["602", "851-8511"]);
eq("so is a 1 before an area code", searchWords("1 602 851 8511"), ["602", "851", "8511"]);
eq("but a 1 on its own stays", searchWords("unit 1"), ["unit", "1"]);
eq("digits of a dotted phone", digitsOf("602.851.8511"), "6028518511");
eq("a leading 1 on eleven digits is the country code", digitsOf("1-602-851-8511"), "6028518511");
eq("a number-like word matches as typed or as digits", wordForms("602.851.8511"), ["602.851.8511", "6028518511"]);
eq("plain digits have one form", wordForms("6028518511"), ["6028518511"]);
eq("“24-7” keeps its dash as a form", wordForms("24-7"), ["24-7", "247"]);
eq("a date keeps its form", wordForms("2026-09-23"), ["2026-09-23", "20260923"]);
eq("letters keep their punctuation", searchWords("o'neil a-1 j.r."), ["o", "neil", "a-1", "j.r."]);
eq("a word with letters has one form", wordForms("4-b"), ["4-b"]);

// --- matching rows already in the browser --------------------------------------
eq("a document adds its digit runs", searchDoc("Call (602) 851-8511 today"), "call (602) 851-8511 today 6028518511");
const lead = "AZ Pro Plumbing and Drain, LLC · Dana Whitfield · (602) 851-8511 · Mesa, AZ";
for (const q of ["drain, llc", "llc drain", "602.851.8511", "+1 602 851 8511", "1-602-851-8511", "6028518511", "851-8511", "whitfield mesa"]) {
  check(`“${q}” matches the row`, matchesAll(lead, searchWords(q)));
}
check("a word that is not there does not", !matchesAll(lead, searchWords("drain zebra")));
check("“24-7 plumbing” finds 24-7 Plumbing", matchesAll("24-7 Plumbing Co", searchWords("24-7 plumbing")));
check("a date finds a file name", matchesAll("TestProject_2026-09-23.csv", searchWords("2026-09-23")));
check("“12.5” finds 12.5", matchesAll("Rate 12.5%", searchWords("12.5")));

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll search word checks passed.");
