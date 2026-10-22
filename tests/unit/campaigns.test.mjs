import assert from "node:assert/strict";
import { campaignsOf, sharedName } from "../../src/lib/campaigns.js";

assert.equal(sharedName(["CapitalIns-InsProsOfAZ_BretGodsey_2026", "CapitalIns-InsProsOfAZ_Appointments_2026"]), "CapitalIns-InsProsOfAZ");
assert.equal(sharedName(["CapitalIns-InsPros-Maricopa DBDev", "CapitalIns-InsPros-Maricopa Appt"]), "CapitalIns-InsPros-Maricopa");
assert.equal(sharedName(["Churches DBDev", "Contractors Appts"]), null, "too little in common");
assert.equal(sharedName(["Only one"]), "Only one");

const projects = [
  { id: 1, name: "CapitalIns-InsPros-Maricopa DBDev", apptProjectId: 2 },
  { id: 2, name: "CapitalIns-InsPros-Maricopa Appt", apptProjectId: null },
  { id: 3, name: "Pinal Contractors", apptProjectId: null },
  { id: 4, name: "Churches DBDev", apptProjectId: 9 }, // tied to a project not listed: on its own
];
assert.deepEqual(campaignsOf(projects), [
  { id: 2, name: "CapitalIns-InsPros-Maricopa", projectIds: [1, 2] },
  { id: 4, name: "Churches DBDev", projectIds: [4] },
  { id: 3, name: "Pinal Contractors", projectIds: [3] },
]);
console.log("campaigns: ok");
