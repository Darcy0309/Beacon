#!/usr/bin/env node
/** Unit tests for coverage: the policy lines, carrier suggestions and carrier imports. */
import { POLICY_LINES, carrierCore, carrierKey, carrierMatcher, carrierNamesFromRows, suggestCarriers } from "../../src/lib/coverage.js";
import { schemas, validate } from "../../src/lib/validate.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};

const always = POLICY_LINES.filter((l) => l.always).map((l) => l.label);
check("the lines always listed: Liability / Package, Workers comp, Auto, Group health, Personal lines",
  JSON.stringify(always) === JSON.stringify(["Liability / Package", "Workers comp", "Auto", "Group health", "Personal lines"]), JSON.stringify(always));

const CARRIERS = ["Travelers", "The Hartford", "Hartford Steam Boiler", "Amtrust Ins Co Of Ks Inc", "AmTrust North America", "Cincinnati Insurance", "State Farm", "Farmers Insurance"];
check("typed letters suggest names starting with them first", JSON.stringify(suggestCarriers(CARRIERS, "har")) === JSON.stringify(["Hartford Steam Boiler", "The Hartford"]), JSON.stringify(suggestCarriers(CARRIERS, "har")));
check("…case and punctuation do not matter (ties A to Z)",
  JSON.stringify(suggestCarriers(CARRIERS, "AMTRUST")) === JSON.stringify(["Amtrust Ins Co Of Ks Inc", "AmTrust North America"]) && suggestCarriers(CARRIERS, "am trust").length === 2,
  JSON.stringify(suggestCarriers(CARRIERS, "am trust")));
check("…a word inside a name counts", JSON.stringify(suggestCarriers(CARRIERS, "farm")) === JSON.stringify(["Farmers Insurance", "State Farm"]), JSON.stringify(suggestCarriers(CARRIERS, "farm")));
check("…nothing typed, nothing suggested", suggestCarriers(CARRIERS, "  ").length === 0);
check("…at most eight", suggestCarriers(Array.from({ length: 20 }, (_, i) => `Mutual ${i}`), "mu").length === 8);
check("two spellings of one carrier compare equal", carrierKey("Amtrust Ins. Co, of KS") === carrierKey("AMTRUST INS CO OF KS"));

check("a carrier CSV: the column headed Carrier, blanks and repeats dropped",
  JSON.stringify(carrierNamesFromRows([["State", "Carrier"], ["AZ", "Travelers"], ["OH", ""], ["TX", "TRAVELERS"], ["KS", "  Amtrust   Ins Co "]])) === JSON.stringify(["Travelers", "Amtrust Ins Co"]));
check("…or just one name a line", JSON.stringify(carrierNamesFromRows([["Travelers"], ["State Farm"]])) === JSON.stringify(["Travelers", "State Farm"]));

const good = { lead_id: "4", ultimate_xdate: "2027-12-20", agency_name: "Garry Insurance", personal_lines_xdate: "2027-03-01", personal_lines_carrier: "State Farm" };
check("a coverage form passes", validate(good, schemas.coverage).ok);
const bad = validate({ ...good, wc_xdate: "2027-02-30", auto_carrier: "x".repeat(121) }, schemas.coverage);
check("…a date that does not exist, or a carrier too long, is named", Boolean(bad.errors.wc_xdate && bad.errors.auto_carrier), JSON.stringify(bad.errors));

// An old list's carriers against the Insurance Companies list (Sean, Nov 2026): a similar match, else blank.
{
  const carrier = carrierMatcher(["The Hartford", "Travelers", "Cincinnati Insurance", "Acuity", "West Bend Mutual", "Auto-Owners Insurance",
    "Amerisure", "State Farm", "State Auto", "EMC Insurance", "Liberty Mutual", "Donegal"]);
  const same = (pairs) => pairs.filter(([written, want]) => carrier(written) !== want).map(([w]) => `${w} → ${carrier(w)}`);
  check("the same carrier without its filler words, any case", carrierCore("Auto Owners Mutual Ins Co") === "autoowners" && !same([
    ["hartford", "The Hartford"], ["HARTFORD INS GROUP", "The Hartford"], ["the travelers cos", "Travelers"], ["auto owners mutual ins co", "Auto-Owners Insurance"],
    ["westbend", "West Bend Mutual"], ["emc", "EMC Insurance"], ["Liberty", "Liberty Mutual"]]).length, same([["hartford", "The Hartford"]]).join());
  check("…a longer form of it, and a slip of a letter (two in a long name)", !same([["Travelers Casualty", "Travelers"], ["cincinatti", "Cincinnati Insurance"],
    ["cinncinati ins", "Cincinnati Insurance"], ["aquity", "Acuity"], ["accuity", "Acuity"], ["hardford", "The Hartford"]]).length,
    same([["Travelers Casualty", "Travelers"], ["cincinatti", "Cincinnati Insurance"], ["aquity", "Acuity"], ["hardford", "The Hartford"]]).join());
  check("what isn't a carrier on the list comes in blank", ["same", "unsure", "undisclosed", "will provide", "not erie insurance", "Monopolistic", "see notes", "/", "Gallagher"]
    .every((w) => carrier(w) === null), ["unsure", "will provide", "Monopolistic"].map((w) => `${w} → ${carrier(w)}`).join());
  check("…a name two letters off a short one isn't taken for it (Acrisure is not Amerisure)", carrier("Acrisure") === null && carrier("donagul") === null);
  check("…nor one as near two carriers as each other", carrier("state") === null && carrier("State Farm Ins Co") === "State Farm");
}

console.log(failures ? `\n${failures} coverage check(s) failed.\n` : "\nAll coverage checks passed.\n");
process.exit(failures ? 1 : 0);
