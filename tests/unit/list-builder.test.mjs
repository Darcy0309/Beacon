import assert from "node:assert/strict";
import {
  branchState, buildTree, cleanCriteria, codesCsv, criteriaSummary, leavesOf, milesBetween, parsePlaces, parseZips,
  pickedOf, sicCode, sicSheetRows, territoryCsv, toggleBranch, withDetails, zipsWithin,
} from "../../src/lib/list-builder.js";

// Codes as the vendor writes them: the agricultural ones keep their leading zero.
assert.equal(sicCode("111"), "0111");
assert.equal(sicCode("11101"), "011101");
assert.equal(sicCode("1521"), "1521");
assert.equal(sicCode("152101"), "152101");
assert.equal(sicCode("1"), "01");
assert.equal(sicCode("01-09"), "01-09");
assert.equal(sicCode("15 - 17"), "15-17");
assert.equal(sicCode("SIC Code"), null);

// Sean's sheet: sectors, groups, codes; each under the right parent; a repeat once.
const rows = sicSheetRows([
  ["SIC Code", "SIC Description"],
  ["01-09", "AGRICULTURE, FORESTRY, & FISHING"], ["01", "AGRICULTURAL PRODUCTION-CROPS"], ["111", "Wheat"], ["112", "Rice"],
  ["15-17", "CONSTRUCTION"], ["15", "BUILDING CONSTRUCTION"], ["1521", "General Contractors-single-family Houses"],
  ["152101", "Custom homes"], ["17", "SPECIAL TRADE"], ["1793", "Glass And Glazing Work"], ["1793", "Glass Installation"],
]);
const by = Object.fromEntries(rows.map((r) => [r.code, r]));
assert.equal(by["0111"].parent, "01");
assert.equal(by["01"].parent, "01-09");
assert.equal(by["152101"].kind, "detail");
assert.equal(by["152101"].parent, "1521");
assert.equal(by["17"].parent, "15-17");
assert.equal(by["1793"].name, "Glass And Glazing Work", "the first of a repeat");
assert.equal(rows.length, 10);

// Sean's complete sheet: "01 to 09" sectors, groups with no code ("01 AGRICULTURAL…"), an industry class column.
const sheet = sicSheetRows([
  ["SIC Code", "SIC Description", "Industry Class"],
  ["01 to 09", "AGRICULTURE, FORESTRY, & FISHING", ""], ["", "01 AGRICULTURAL PRODUCTION-CROPS", ""], ["0111", "Wheat", "Agricultural Production - Crops"],
  ["", "07 AGRICULTURAL SERVICES", ""], ["0781", "Landscape Counseling And Planning", "Artisan-Special Trade Contractors"],
  ["64 to 65", "FINANCE, INSURANCE, & REAL ESTATE", ""], ["", "64 INSURANCE AGENTS BROKERS & SERVICE", ""], ["6411", "Insurance Agents Brokers & Service", "Insurance Agents"],
]);
const s2 = Object.fromEntries(sheet.map((r) => [r.code, r]));
assert.equal(s2["01-09"].kind, "sector");
assert.equal(s2["01"].name, "Agricultural Production-Crops", "capitals in ordinary case");
assert.equal(s2["01"].parent, "01-09");
assert.equal(s2["0781"].parent, "07");
assert.equal(s2["0781"].class, "Artisan-Special Trade Contractors");
assert.equal(s2["64"].parent, "64-65");
assert.equal(s2["6411"].class, "Insurance Agents");
assert.deepEqual(sheet.map((r) => r.sort), [1, 2, 3, 4, 5, 6, 7, 8], "in the sheet's order");

// The tree, and ticking a branch.
const tree = buildTree(rows);
assert.deepEqual(tree.roots.map((n) => n.code), ["01-09", "15-17"]);
const construction = tree.byCode.get("15-17");
assert.deepEqual(leavesOf(construction), ["1521", "1793"], "an industry is pulled whole, its 6-digit codes part of it");
let picked = toggleBranch(construction, new Set());
assert.equal(branchState(construction, picked), "all");
picked = toggleBranch(tree.byCode.get("17"), picked);
assert.equal(branchState(construction, picked), "some");
assert.equal(branchState(tree.byCode.get("01-09"), picked), "none");
assert.equal(branchState(toggleBranch(construction, picked) && construction, toggleBranch(construction, picked)), "all", "a partly ticked branch ticks all");

// The 6-digit codes from the SIC list (Oct 2026): under their industry, of its class; one already there or with nowhere to go, left out.
const full = buildTree(withDetails(sicSheetRows([
  ["SIC Code", "SIC Description", "Industry Class"],
  ["15-17", "CONSTRUCTION", ""], ["17", "SPECIAL TRADE", ""], ["1741", "Masonry, Stone Setting, And Other Stone Work", "Masonry"], ["1742", "Plastering", "Drywall"],
]), [["174101", "Masonry Contractors"], ["174102", "Stone Setting"], ["174103", "Chimney Builders"], ["174101", "Again"], ["999901", "Nowhere"], ["1741", "Not six"]]));
const masonry = full.byCode.get("1741");
assert.deepEqual(masonry.children.map((n) => [n.code, n.kind, n.class]),
  [["174101", "detail", "Masonry"], ["174102", "detail", "Masonry"], ["174103", "detail", "Masonry"]]);
assert.equal(full.byCode.has("999901"), false);
assert.deepEqual(leavesOf(full.byCode.get("17")), ["1741", "1742"]);
const tick = (code, now) => toggleBranch(full.byCode.get(code), now);
let p6 = tick("1741", new Set());
assert.deepEqual([...p6], ["1741"], "an industry ticked keeps its own code");
assert.equal(branchState(full.byCode.get("174102"), p6), "all", "…and so each of its 6-digit codes");
p6 = tick("174102", p6);
assert.deepEqual([...p6].sort(), ["174101", "174103"], "one of them taken off: the rest kept");
assert.equal(branchState(masonry, p6), "some");
assert.deepEqual(pickedOf(masonry, p6), [2, 3]);
assert.deepEqual(pickedOf(full.byCode.get("17"), p6), [1, 2], "a group counts its industries with any ticked");
assert.equal(branchState(full.byCode.get("15-17"), p6), "some");
p6 = tick("174102", p6);
assert.deepEqual([...p6], ["1741"], "all of them ticked again: the industry");
p6 = tick("174103", tick("174101", new Set()));
assert.deepEqual([...p6].sort(), ["174101", "174103"]);
p6 = tick("17", p6);
assert.deepEqual([...p6].sort(), ["1741", "1742"], "a group ticked: its industries whole, their 6-digit codes giving way");
assert.deepEqual([...tick("17", p6)], [], "…and unticked");
assert.equal(branchState(masonry, new Set(["174101"])), "some", "a saved 6-digit code shows its industry partly ticked");

// The territory.
assert.deepEqual(parseZips("85201, 85202\n85203-1234 abc 1234 85201"), ["85201", "85202", "85203"]);
assert.deepEqual(parsePlaces("Mesa, AZ\nmesa, az\n  Tempe,  AZ ;Gilbert, AZ"), ["Mesa, AZ", "Tempe, AZ", "Gilbert, AZ"]);
assert.ok(Math.abs(milesBetween([33.4152, -111.8315], [33.4255, -111.94]) - 6.3) < 0.3, "Mesa to Tempe, about 6 miles");
const table = { "85201": [33.43, -111.85], "85281": [33.43, -111.93], "86001": [35.18, -111.65] };
assert.deepEqual(zipsWithin(table, "85201", 10).map((z) => z.zip), ["85201", "85281"]);
assert.equal(zipsWithin(table, "99999", 10), null);

// Criteria made safe: sizes only for groups picked (from no more than to), the ZIPs less those left out.
const c = cleanCriteria({
  sic: ["1793", "1793", "111", "15-17", "x"],
  employees: { "17": { min: "50", max: "10" }, "20": { min: 5 }, "01": { min: "", max: "" } },
  include: { states: ["az", "Arizona", "NM"], zips: ["85201", "85202"], radius: { zip: "85201", miles: 900 } },
  exclude: { zips: ["85281"] },
}, ["85201", "85281", "85290"]);
assert.deepEqual(c.sic, ["1793", "0111"]);
assert.deepEqual(c.employees, { "17": { min: 10, max: 50 } });
assert.deepEqual(c.include.states, ["AZ", "NM"]);
assert.equal(c.include.radius.miles, 250, "a radius is held to 250 miles");
assert.deepEqual(c.zips.sort(), ["85201", "85202", "85290"]);

// The exports: the codes one to a line; the territory in columns.
const codes = codesCsv(c, { "1793": "Glass And Glazing Work", "0111": "Wheat" }).split("\r\n");
assert.deepEqual(codes, ["SIC Code,SIC Description", "1793,Glass And Glazing Work", "0111,Wheat"]);
const terr = territoryCsv(c).split("\r\n");
assert.equal(terr[0], "ZIP codes,States,Counties,Cities,Leave out: states,Leave out: counties,Leave out: cities,Leave out: ZIP codes");
assert.equal(terr[1], "85201,AZ,,,,,,85281");
assert.equal(criteriaSummary(c), "2 codes · 2 states · 3 ZIPs · 250 mi of 85201");
console.log("list builder: ok");
