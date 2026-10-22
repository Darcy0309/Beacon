import assert from "node:assert/strict";
import { filterParams, personShort, pipelineCsv, pipelineMonths, readXdateFilters, sortPipeline, stale } from "../../src/lib/pipeline.js";

// The address.
const f = readXdateFilters({ project: "14,7,abc,14", managers: "5", months: "11,12,1,13", client: "3", rep: "x", type: "APPT" });
assert.deepEqual(f, { projectIds: [14, 7], userIds: [5], months: [11, 12, 1], companyId: 3, repId: null, type: "APPT" });
assert.equal(filterParams(f).toString(), "client=3&project=14%2C7&managers=5&months=11%2C12%2C1&type=APPT");
assert.deepEqual(readXdateFilters({}), { projectIds: [], userIds: [], months: [], companyId: null, repId: null, type: null });

// The months, as they come up: the next three by default (Nov, Dec, Jan in October).
assert.deepEqual(pipelineMonths([], "2026-10-22"), [11, 12, 1]);
assert.deepEqual(pipelineMonths([1, 10, 12], "2026-10-22"), [10, 12, 1]);

assert.equal(personShort("Jen", "Bell"), "Jen B");
assert.equal(stale("2026-10-12", "2026-10-22"), false, "ten days back: not yet");
assert.equal(stale("2026-10-11", "2026-10-22"), true, "eleven: behind");
assert.equal(stale(null, "2026-10-22"), true, "never: behind");

const rows = [
  { project: "B", manager: "Jen B", lastWorkedDay: "2026-10-21" },
  { project: "A", manager: "Jen B", lastWorkedDay: "2026-10-01" },
  { project: "C", manager: "Amy K", lastWorkedDay: null },
];
assert.deepEqual(sortPipeline(rows).map((r) => r.project), ["C", "A", "B"], "by manager, the longest unworked first");

// The sample's first row, back out as CSV.
const csv = pipelineCsv([{
  project: "CapitalInsServices_Nebraska_Trucking_P&C_Appts", timeZone: "PST", state: "AZ", manager: "Jen B", lastApptSet: "2026-04-21",
  lastWorkedDay: "2026-10-21", calls: null, months: { 11: 31, 12: 38, 1: 15 }, total: 84, appts: 10, offList: 23, viableLeft: 51,
  pay: 35, specialPay: 5, salesRep: "Sean F", conversion: 12, sharedWith: ["Sean F", "Kristy W"],
}], [11, 12, 1]).split("\r\n");
assert.equal(csv[0], "projectname,TimeZone,ST,Manager,last appt set,LastWorked,Calls,NOV,DEC,JAN,Total,Appts,OffTheList,ViableLeft,PAY,SpecialPay,SalesRep,Conv%,SharedWith");
assert.equal(csv[1], 'CapitalInsServices_Nebraska_Trucking_P&C_Appts,PST,AZ,Jen B,4/21/2026,10/21/2026,,31,38,15,84,10,23,51,$35,$5,Sean F,12%,"Sean F, Kristy W"');
console.log("pipeline: ok");
