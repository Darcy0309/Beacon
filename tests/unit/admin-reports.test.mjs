#!/usr/bin/env node
/** Unit tests for the administrators' Reports (admin-reports.js; Sean, Nov 2026). */
import { billingCsv, groupBy, inMonths, itemsCsv, lastMonths, monthSeries, outcomes, periodOf, topClients, totals, withBilling } from "../../src/lib/admin-reports.js";

let failures = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); failures++; }
};

is("a tile's months: 1, 3 or 6, the current month unless said", [periodOf("3"), periodOf("6"), periodOf(""), periodOf("12")], [3, 6, 1, 1]);
const months = lastMonths("2026-11-03", 6);
is("the last six months to November, oldest first", months.map((m) => `${m.key} ${m.label}`), ["2026-06 Jun", "2026-07 Jul", "2026-08 Aug", "2026-09 Sep", "2026-10 Oct", "2026-11 Nov"]);
is("…each its first day to its last", [months[5].from, months[5].to, months[4].to], ["2026-11-01", "2026-11-30", "2026-10-31"]);
is("…across a year's end", lastMonths("2027-01-10", 3).map((m) => m.key), ["2026-11", "2026-12", "2027-01"]);

// report_counts()'s rows: a month, a project, a manager.
const r = (ym, project_id, user_id, f) => ({ ym, project_id, user_id, leads: 0, invalid_leads: 0, appts: 0, confirmed: 0, pending: 0, invalid_appts: 0, rescheduled: 0, ...f });
const rows = [
  r("2026-11", 1, 10, { leads: 5, invalid_leads: 1, appts: 2, confirmed: 1, pending: 1, invalid_appts: 1, rescheduled: 1 }),
  r("2026-11", 2, 11, { leads: 3, appts: 4, confirmed: 3, pending: 1 }),
  r("2026-10", 1, 10, { leads: 10, appts: 1, pending: 1 }),
  r("2026-08", 3, 11, { leads: 1 }),
];
const projects = { 1: { client: "Capital", companyId: 100, salesRepId: 7 }, 2: { client: "Rural", companyId: 200, salesRepId: 8 }, 3: { client: "Capital", companyId: 100, salesRepId: 7 } };
const nov = inMonths(rows, ["2026-11"]);
is("the current month's totals", [totals(nov).leads, totals(nov).appts, totals(nov).invalid_appts], [8, 6, 1]);
is("…three months'", totals(inMonths(rows, months.slice(3).map((m) => m.key))).leads, 18);
is("by Sales Rep: their clients' projects", groupBy(nov, (x) => projects[x.project_id].salesRepId).map((g) => [g.key, g.leads, g.invalid_leads, g.appts, g.invalid_appts]),
  [[7, 5, 1, 2, 1], [8, 3, 0, 4, 0]]);
const byClient = groupBy(rows, (x) => projects[x.project_id].companyId);
is("top clients: a lead 1, an appointment 2", topClients(byClient, 5).map((g) => [g.key, g.units]), [[100, 22], [200, 11]]);
is("…the top five at most, none without production", topClients([{ key: 1, leads: 0, appts: 0 }], 5), []);
is("by manager", groupBy(nov, (x) => x.user_id).map((g) => [g.key, g.leads, g.appts]), [[10, 5, 2], [11, 3, 4]]);
is("Appointment Outcomes: scheduled (every one set), confirmed, rescheduled, invalid", outcomes(totals(nov)), [["Scheduled", 7], ["Confirmed", 4], ["Rescheduled", 1], ["Invalid", 1]]);
is("each month's leads and appointments", monthSeries(rows, months.slice(4)).map((m) => [m.label, m.leads, m.appts]), [["Oct", 10, 1], ["Nov", 8, 6]]);

// Billing, as Sean's sample: 50 leads at $15, 20 appointments at $70.
const b = withBilling({ client: "Capital Insurance", project: "Capital Insurance-Maricopa", leads: "50", appts: "20", confirmed: "15", pending: "5", invalid_appts: "3", invalid_leads: "2",
  names_called: "90", cost: "1100", bill_lead_rate: "15", bill_appointment_rate: "70" });
is("leads and appointments billed at the project's rates", [b.leadBilling, b.apptBilling, b.totalBilling], [750, 1400, 2150]);
is("…no rate set: no billing to show", [withBilling({ leads: 3, appts: 1, cost: 0, bill_lead_rate: null, bill_appointment_rate: null }).totalBilling], [null]);
const csv = billingCsv([b]).split("\r\n");
is("the CSV: the sample's columns", csv[0], "Client,Project,Leads,LeadBilling,Appointments,AppointmentBilling,TotalBilling,ConfirmedAppts,InvalidAppts,PendingAppts,NamesCalled,Cost");
is("…a project a row", csv[1], "Capital Insurance,Capital Insurance-Maricopa,50,750.00,20,1400.00,2150.00,15,3,5,90,1100.00");
is("…and a total", csv[2], "Total,,50,750.00,20,1400.00,2150.00,15,3,5,90,1100.00");
is("a figure's names as a CSV", itemsCsv([{ company: "Acme, Inc", at: "2026-11-02", status: "Developed", manager: "Sean F", cost: 15, sales_rep: "Mike P", project: "Maricopa" }], "leads").split("\r\n"),
  ["Company,Date developed,Status,Manager,Cost,Sales Rep,Project", '"Acme, Inc",2026-11-02,Developed,Sean F,15.00,Mike P,Maricopa']);

console.log(failures ? `\n${failures} check(s) failed.\n` : "\nAll admin reports checks passed.\n");
process.exit(failures ? 1 : 0);
