/**
 * The administrators' Reports (Sean, Nov 2026): leads delivered and
 * appointments set (with those confirmed and invalid), each Sales Rep's
 * clients' production and the top clients along the top, each over the
 * current month or the last three or six; leads against appointments by
 * month with the figures under the bars, for every client or a Sales Rep's;
 * appointments and leads by manager and the appointments' outcomes; and the
 * billing listing at the foot, billed at each project's rates, a Sales Rep's
 * or all, every figure opening its names, both to export. The rates are set
 * on the project's form. Administrators only.
 *
 * Removes everything it made.
 *
 *   node tests/e2e/admin-reports.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `AR-E2E ${Date.now()}`;
const SEAN = 2, MIKE = 3, RACHEL = 4;
const [from, today, lastFrom, lastTo] = sql(`select concat_ws('|', date_trunc('month', (now() at time zone public.business_tz()))::date, (now() at time zone public.business_tz())::date,
  (date_trunc('month', (now() at time zone public.business_tz())) - interval '1 month')::date, (date_trunc('month', (now() at time zone public.business_tz())) - interval '1 day')::date)`).split("|");

// Mike's client, billed $15 a lead and $70 an appointment.
const company = Number(sql(`insert into public.companies (name, sales_rep_id) values (${lit(`${TAG} Co`)}, ${MIKE}) returning id`));
const P = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, bill_lead_rate, bill_appointment_rate)
  values (${lit(`${TAG} Appts`)}, ${company}, (select id from public.project_types where code = 'APPT'), 1, 15, 70) returning id`));
const lead = (name, f = {}) => Number(sql(`insert into public.leads (company_name, project_id, stage, promoted_at, dbdv_user_id, call_result_dbdv)
  values (${lit(`${TAG} ${name}`)}, ${P}, 'appt', ${f.at ?? "now()"}, ${SEAN}, ${f.invalid ? "'Lead-Invalid'" : "'Lead'"}) returning id`));
// This month: three leads and an invalid one; last month, one.
const [L1, L2, L3] = ["Alpha", "Bravo", "Charlie"].map((n) => lead(n));
lead("Delta", { invalid: true });
lead("Echo", { at: `(${lit(lastFrom)}::date + 3)::timestamp at time zone public.business_tz()` });
// Appointments set this month: confirmed, pending, invalid; Rachel's rescheduled.
const appt = (leadId, user, f = "") => Number(sql(`insert into public.appointments (lead_id, project_id, set_project_id, user_id, appt_date, status_id, confirmed_at, invalid_at)
  values (${leadId}, ${P}, ${P}, ${user}, current_date + 7, (select id from public.appointment_statuses where name = ${lit(f === "rescheduled" ? "Rescheduled" : "Scheduled")}),
  ${f === "confirmed" ? "now()" : "null"}, ${f === "invalid" ? "now()" : "null"}) returning id`));
const A1 = appt(L1, SEAN, "confirmed");
appt(L2, SEAN);
appt(L3, SEAN, "invalid");
appt(L3, RACHEL, "rescheduled");
for (const l of [L1, L1, L2]) sql(`insert into public.call_records (lead_id, project_id, user_id) values (${l}, ${P}, ${SEAN})`);
const pay = (l, kind, amount, a = "null") => sql(`insert into public.pay_events (user_id, project_id, lead_id, appointment_id, kind, amount) values (${SEAN}, ${P}, ${l}, ${a}, '${kind}', ${amount})`);
pay(L1, "lead", 5);
pay(L1, "appointment", 20, A1);
pay(L1, "confirmation", 10, A1);

const cells = (page, sel) => page.ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}); return r ? [...r.cells].map((c) => c.textContent.trim()) : null; })()`);
const billingRow = (page) => cells(page, `[data-billing-row="${P}"]`);
const catchCsv = (page) => page.ev(`window.__csv = null; if (!window.__csvHooked) { window.__csvHooked = true; const make = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (b) => { b.text().then((t) => { window.__csv = t; }); return make(b); };
  const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) return; return click.call(this); }; }`);
const choose = async (page, param, label) => {
  await page.mouseClick(`button[data-param="${param}"]`);
  await until(() => page.ev(`!!document.querySelector('[role=menuitemradio]')`));
  return page.ev(`(() => { const i = [...document.querySelectorAll('[role=menuitemradio]')].find((e) => e.textContent.trim() === ${JSON.stringify(label)}); if (!i) return false; i.click(); return true; })()`);
};

const browser = await launchBrowser({ mouse: true });
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 1100 });

  section("Along the top");
  await admin.go("/reports", 8000);
  check("the administrators' Reports", await until(() => admin.ev("!!document.querySelector('[data-admin-reports]')")));
  check("no Lead by Call Result, no Top States", await admin.ev(`!/Lead by Call Result|Top States/.test(document.body.innerText)`));
  check("Appointments Set: those confirmed and invalid under it", /\d+ confirmed · \d+ invalid/.test(await admin.ev("document.querySelector('[data-appts-split]')?.textContent ?? ''")));
  const rep = await cells(admin, `[data-card="sales-reps"] [data-rep-row="${MIKE}"]`);
  check("Clients by Sales Rep: Mike's clients' leads, invalid leads, appointments, invalid appointments", JSON.stringify(rep) === JSON.stringify(["Mike Preston", "3", "1", "3", "1"]), JSON.stringify(rep));
  const top = await admin.ev(`document.querySelector('[data-top-client="${company}"]')?.textContent ?? ''`);
  check("Top Producing Clients: a lead 1, an appointment 2 — 3 + 6", /9\s*·\s*3 L\s*·\s*3 A/.test(top), top);
  const periods = await admin.ev(`[...document.querySelectorAll('[data-period-switch]')].map((s) => [s.dataset.periodSwitch, [...s.querySelectorAll('a')].map((a) => a.textContent).join(' '), s.querySelector('[aria-current]')?.textContent])`);
  check("every card its own 1, 3 or 6 months, the current month first", periods.length === 8 && periods.every(([, opts, on]) => opts === "1M 3M 6M" && on === "1M"), JSON.stringify(periods));

  section("A card's months");
  await admin.ev(`[...document.querySelectorAll('[data-period-switch="sr"] a')].find((a) => a.textContent === '6M').click()`);
  check("6M on Clients by Sales Rep", await until(async () => (await admin.url()).includes("sr=6")), await admin.url());
  const six = await until(async () => { const r = await cells(admin, `[data-card="sales-reps"] [data-rep-row="${MIKE}"]`); return r?.[1] === "4" && r; });
  check("…counts last month's lead too", Boolean(six), JSON.stringify(six));
  check("…the other cards keep theirs", await admin.ev(`[...document.querySelectorAll('[data-period-switch]')].filter((s) => s.dataset.periodSwitch !== 'sr').every((s) => s.querySelector('[aria-current]')?.textContent === '1M')`));

  section("Leads vs Appointments");
  const months = () => admin.ev(`[...document.querySelectorAll('[data-chart-table] thead th')].slice(1).map((h) => h.textContent)`);
  check("the current month, with the figures under the bars", (await months()).length === 2 && (await admin.ev("document.querySelectorAll('[data-chart-table] [data-chart-row]').length")) === 3, JSON.stringify(await months()));
  await admin.ev(`[...document.querySelectorAll('[data-period-switch="ch"] a')].find((a) => a.textContent === '6M').click()`);
  check("6M: six months and their total", Boolean(await until(async () => (await months()).length === 7)), JSON.stringify(await months()));
  check("…a bar pair a month", (await admin.ev("document.querySelectorAll('[data-months-chart] [data-tip]').length")) === 6);
  check("a Sales Rep's clients alone", await choose(admin, "chrep", "Mike Preston") && Boolean(await until(async () => (await admin.url()).includes(`chrep=${MIKE}`))));
  const mikes = await until(async () => { const l = await cells(admin, '[data-chart-row="leads"]'); return l?.[1] === "4" && l; });
  const appts = await cells(admin, '[data-chart-row="appts"]');
  check("…4 leads over six months, last month's and this month's", Boolean(mikes) && mikes.at(-1) === "3" && mikes.at(-2) === "1", JSON.stringify(mikes));
  check("…3 appointments, this month's", appts?.[1] === "3" && appts.at(-1) === "3", JSON.stringify(appts));
  check("…and the conversion", (await cells(admin, '[data-chart-row="conversion"]'))?.[1] === "75%");

  section("By manager, and the outcomes");
  const bars = (card) => admin.ev(`document.querySelector('[data-card="${card}"]').innerText`);
  check("Appointments by Rep: Sean and Rachel, with Sean's invalid ones", /Sean Fitzgerald · \d+ invalid/.test(await bars("appts-by-rep")) && /Rachel/.test(await bars("appts-by-rep")), await bars("appts-by-rep"));
  check("Leads by Rep: Sean, with his invalid ones", /Sean Fitzgerald · \d+ invalid/.test(await bars("leads-by-rep")), await bars("leads-by-rep"));
  check("Appointment Outcomes: Scheduled, Confirmed, Rescheduled, Invalid", JSON.stringify(await admin.ev(`[...document.querySelectorAll('[data-outcome]')].map((o) => o.dataset.outcome)`)) === JSON.stringify(["Scheduled", "Confirmed", "Rescheduled", "Invalid"]));

  section("Billing & Production");
  await admin.go("/reports#billing", 7000);
  const row = await until(() => billingRow(admin));
  check("each active client's project, this month: leads $15 each, appointments (not the invalid) $70 each",
    JSON.stringify(row?.slice(2)) === JSON.stringify(["3", "$45.00", "3", "$210.00", "$255.00", "1", "1", "2", "2", "$35.00"]), JSON.stringify(row));
  const fit = await admin.ev(`(() => { const t = document.querySelector('[data-billing-table]'); return [t.scrollWidth, t.parentElement.clientWidth]; })()`);
  check("…every column inside its card", fit[0] <= fit[1], JSON.stringify(fit));
  check("…and a total", await admin.ev("!!document.querySelector('[data-billing-total]')"));
  check("a Sales Rep's clients: Mike's", await choose(admin, "brep", "Mike Preston") && Boolean(await until(async () => (await admin.url()).includes(`brep=${MIKE}`) && billingRow(admin))));
  check("…only theirs", await until(() => admin.ev(`[...document.querySelectorAll('[data-billing-row]')].every((r) => r.dataset.billingRow === '${P}' || r.cells[0].textContent !== '')`)));
  await catchCsv(admin);
  await admin.click("[data-export-billing]");
  const csv = ((await until(() => admin.ev("window.__csv"))) ?? "").replace(/^﻿/, "").split(/\r\n/);
  check("Export CSV: the sample's columns, the project's row, the total",
    csv[0] === "Client,Project,Leads,LeadBilling,Appointments,AppointmentBilling,TotalBilling,ConfirmedAppts,InvalidAppts,PendingAppts,NamesCalled,Cost"
    && csv.includes(`${TAG} Co,${TAG} Appts,3,45.00,3,210.00,255.00,1,1,2,2,35.00`) && csv.some((l) => l.startsWith("Total,")), JSON.stringify(csv.slice(0, 3)));

  section("A figure's names");
  await admin.ev(`document.querySelector('[data-billing-row="${P}"] [data-billing-link="confirmed"]').click()`);
  check("the confirmed appointment opens its list", await until(async () => (await admin.path()) === "/reports/billing" && admin.ev("!!document.querySelector('[data-billing-items=\"confirmed\"]')")), await admin.url());
  const item = await cells(admin, "[data-billing-items] tbody tr");
  check("…the company, when set, its manager, the cost and the Sales Rep", item?.[0] === `${TAG} Alpha` && item[1] === today && item[3] === "Confirmed" && item[4] === "Sean Fitzgerald" && item[5] === "$30.00" && item[6] === "Mike Preston", JSON.stringify(item));
  check("…opening the lead", (await admin.ev("document.querySelector('[data-billing-items] tbody a')?.getAttribute('href')")) === `/leads/${L1}`);
  await catchCsv(admin);
  await admin.click("[data-export-items]");
  const items = ((await until(() => admin.ev("window.__csv"))) ?? "").replace(/^﻿/, "").split(/\r\n/);
  check("…to export", items[0] === "Company,Date set,Appointment,Status,Manager,Cost,Sales Rep,Project" && items[1]?.startsWith(`${TAG} Alpha,${today},`) && items[1].includes(",Confirmed,Sean Fitzgerald,30.00,Mike Preston,"), JSON.stringify(items));
  check("…and back to the listing as it was", (await admin.ev("document.querySelector('.back-link').getAttribute('href')")) === `/reports?bf=${from}&bt=${today}&brep=${MIKE}#billing`);
  await admin.go(`/reports/billing?project=${P}&kind=leads&from=${from}&to=${today}`, 6000);
  check("the leads: the three developed", (await until(() => admin.ev("document.querySelectorAll('[data-billing-items=\"leads\"] tbody tr').length"))) === 3);

  section("A range of days");
  await admin.go(`/reports?bf=${lastFrom}&bt=${lastTo}#billing`, 7000);
  const last = await until(async () => { const r = await billingRow(admin); return r?.[2] === "1" && r; });
  check("last month: its lead", Boolean(last) && last[4] === "0" && last[3] === "$15.00", JSON.stringify(last ?? (await billingRow(admin))));

  section("The project's billing rates");
  await admin.go(`/projects/${P}`, 6000);
  await admin.click("button", "Edit");
  await until(() => admin.ev("!!document.querySelector('[data-bill-lead-rate]')"));
  check("on the project's form", (await admin.ev("[document.querySelector('[data-bill-lead-rate]').value, document.querySelector('[data-bill-appointment-rate]').value].join()")) === "15.00,70.00"
    || (await admin.ev("[document.querySelector('[data-bill-lead-rate]').value, document.querySelector('[data-bill-appointment-rate]').value].join()")) === "15,70");
  await admin.fill("[data-bill-lead-rate]", "20");
  await admin.click("[role=dialog] button[type=submit]");
  check("saved", Boolean(await until(() => sql(`select bill_lead_rate from public.projects where id = ${P}`) === "20.00")));
  await admin.go("/reports#billing", 7000);
  const raised = await until(async () => { const r = await billingRow(admin); return r?.[3] === "$60.00" && r; });
  check("the listing bills at it", Boolean(raised) && raised[6] === "$270.00", JSON.stringify(raised ?? (await billingRow(admin))));

  section("Administrators only");
  const manager = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1400, height: 900 });
  await manager.go("/reports", 6000);
  check("a manager's Reports are their own", !(await manager.ev("!!document.querySelector('[data-admin-reports]')")));
  await manager.go(`/reports/billing?project=${P}&kind=leads&from=${from}&to=${today}`, 5000);
  check("…and no figure's names", !(await manager.ev("!!document.querySelector('[data-billing-items]')")) && /not found|don.t have access/i.test(await manager.text()));
} finally {
  browser.close();
  const like = lit(`${TAG}%`);
  sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)} or body like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.pay_events where project_id = ${P}`);
  sql(`delete from public.call_records where project_id = ${P}`);
  sql(`delete from public.appointments where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.leads where company_name like ${like}`);
  sql(`delete from public.projects where id = ${P}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("admin reports");
