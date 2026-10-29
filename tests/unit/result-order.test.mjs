#!/usr/bin/env node
/** Unit tests for the order call results are listed in on the Leads page (Sean's sheet). */
import { orderResults } from "../../src/lib/result-order.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};

// As the database has them: by stage, then each result's own order.
const db = [
  ["APPT", "Lead-No Contact"], ["APPT", "Lead-Viable"], ["APPT", "Lead-Left Message"], ["APPT", "Lead-Email"], ["APPT", "Lead-ClientList"], ["APPT", "Appointment"],
  ["APPT", "Appointment-Phone"], ["APPT", "Appointment-Confirmed"], ["APPT", "Lead-Not Shopping"], ["APPT", "Lead-Never Shops"],
  ["APPT", "Lead-Corrected"], ["APPT", "Lead-Removed"], ["APPT", "Lead-DoNotCall"], ["APPT", "Lead-Disco#"], ["APPT", "Lead-Out of Business"],
  ["APPT", "Lead-Branch"], ["APPT", "Lead-Not Qualified"], ["APPT", "Lead-CurrentClient"], ["APPT", "Lead-Invalid"], ["APPT", "Appointment-Invalid"],
  ["DBDV", "Viable-CallBack"], ["DBDV", "Viable-Staged"], ["DBDV", "Viable-Left Message"], ["DBDV", "Viable-Email"], ["DBDV", "Lead"],
  ["DBDV", "Lead-Hot Lead"], ["DBDV", "Appointment"], ["DBDV", "Appointment-Phone"], ["DBDV", "Appointment-Confirmed"], ["DBDV", "Not Interested"],
  ["DBDV", "Disco#"], ["DBDV", "Out of Business"], ["DBDV", "Branch"], ["DBDV", "Removed"], ["DBDV", "Not Qualified"], ["DBDV", "DoNotCall"],
  ["DBDV", "Client"], ["DBDV", "Pending"], ["DBDV", "Lead-Invalid"], ["DBDV", "Appointment-Invalid"],
].map(([project_type, name], i) => ({ id: i + 1, project_type, name }));
const names = (stage) => orderResults(db).filter((r) => r.project_type === stage).map((r) => r.name);

check("appointment setting's first, as the sheet lists them", JSON.stringify(names("APPT")) === JSON.stringify([
  "Appointment", "Appointment-Phone", "Appointment-Confirmed", "Appointment-Invalid", "Lead-No Contact", "Lead-Viable", "Lead-Left Message", "Lead-Email",
  "Lead-ClientList", "Lead-Not Shopping", "Lead-Corrected", "Lead-Never Shops", "Lead-Removed", "Lead-DoNotCall", "Lead-Out of Business",
  "Lead-Branch", "Lead-Not Qualified", "Lead-CurrentClient", "Lead-Invalid", "Lead-Disco#",
]), JSON.stringify(names("APPT")));
check("…then DB dev's, Viable-CallBack in the sheet's Viable-No Contact place, the ones it leaves out last", JSON.stringify(names("DBDV")) === JSON.stringify([
  "Viable-CallBack", "Viable-Staged", "Viable-Left Message", "Viable-Email", "Lead", "Lead-Hot Lead", "Not Interested", "Disco#",
  "Out of Business", "Branch", "Removed", "Not Qualified", "DoNotCall", "Client", "Pending",
  "Appointment", "Appointment-Phone", "Appointment-Confirmed", "Lead-Invalid", "Appointment-Invalid",
]), JSON.stringify(names("DBDV")));
check("every result kept, once", orderResults(db).length === db.length && orderResults(db)[0].project_type === "APPT" && orderResults(db).at(-1).project_type === "DBDV");
check("a result named as the sheet's Viable-No Contact takes its place too",
  orderResults([{ project_type: "DBDV", name: "Viable-Staged" }, { project_type: "DBDV", name: "Viable-No Contact" }])[0].name === "Viable-No Contact");

console.log(failures ? `\n${failures} result order check(s) failed.\n` : "\nAll result order checks passed.\n");
process.exit(failures ? 1 : 0);
