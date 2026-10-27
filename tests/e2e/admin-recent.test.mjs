/**
 * Recent Leads & Appointments on the administrator's dashboard (Sean, Oct
 * 2026), in place of the six newest imported leads: what every manager
 * developed today to begin with, or over a week, a pay period or days of
 * one's own; leads, appointments or both. Company, Client, Project, Call
 * result, Ultimate X-Date, Manager, Created.
 *
 * Removes everything it made.
 *
 *   node tests/e2e/admin-recent.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `AR-E2E ${Date.now()}`;
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const today = sql("select ((now() at time zone public.business_tz())::date)::text");
const earlier = sql(`select (${lit(today)}::date - 3)::text`);
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} DBDev`)}, ${company}, (select id from public.project_types where code='DBDV'), 1) returning id`));
const result = (name) => sql(`select id from public.call_results where project_type = 'DBDV' and name = ${lit(name)}`);
const lead = (name, r) => Number(sql(`insert into public.leads (project_id, company_name, city, state, result_id) values (${project}, ${lit(`${TAG} ${name}`)}, 'Phoenix', 'AZ', ${result(r)}) returning id`));
const [plumbing, roofing, older] = [lead("Plumbing", "Lead-Hot Lead"), lead("Roofing", "Appointment-Phone"), lead("Older Co", "Lead")];
// A second project, with a lead of its own today: for the Project filter.
const other = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} Other DBDev`)}, ${company}, (select id from public.project_types where code='DBDV'), 1) returning id`));
const glass = Number(sql(`insert into public.leads (project_id, company_name, city, state, result_id) values (${other}, ${lit(`${TAG} Glass`)}, 'Mesa', 'AZ', ${result("Lead")}) returning id`));
const glassCall = Number(sql(`insert into public.call_records (lead_id, project_id, user_id, call_date, result_id) values (${glass}, ${other}, ${SEAN}, now(), ${result("Lead")}) returning id`));
sql(`insert into public.pay_events (user_id, project_id, lead_id, call_record_id, kind, amount, created_at) values (${SEAN}, ${other}, ${glass}, ${glassCall}, 'lead', 10, now())`);
sql(`insert into public.insurance_details (lead_id, ultimate_xdate) values (${plumbing}, '2027-03-15')`);
// A second client, owned by Sean as its Sales Rep, with a lead today: for the Client and Sales Rep filters.
const company2 = Number(sql(`insert into public.companies (name, sales_rep_id) values (${lit(`${TAG} Second, Inc.`)}, ${SEAN}) returning id`));
const third = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} Third DBDev`)}, ${company2}, (select id from public.project_types where code='DBDV'), 1) returning id`));
const tile = Number(sql(`insert into public.leads (project_id, company_name, city, state, result_id) values (${third}, ${lit(`${TAG} Tile`)}, 'Mesa', 'AZ', ${result("Lead")}) returning id`));
const tileCall = Number(sql(`insert into public.call_records (lead_id, project_id, user_id, call_date, result_id) values (${tile}, ${third}, ${SEAN}, now(), ${result("Lead")}) returning id`));
sql(`insert into public.pay_events (user_id, project_id, lead_id, call_record_id, kind, amount, created_at) values (${SEAN}, ${third}, ${tile}, ${tileCall}, 'lead', 10, now())`);
const call = (l, r) => Number(sql(`insert into public.call_records (lead_id, project_id, user_id, call_date, result_id) values (${l}, ${project}, ${SEAN}, now(), ${result(r)}) returning id`));
sql(`insert into public.pay_events (user_id, project_id, lead_id, call_record_id, kind, amount, created_at) values
  (${SEAN}, ${project}, ${plumbing}, ${call(plumbing, "Lead-Hot Lead")}, 'lead', 10, now()),
  (${SEAN}, ${project}, ${roofing}, ${call(roofing, "Appointment-Phone")}, 'appointment', 40, now()),
  (${SEAN}, ${project}, ${older}, ${call(older, "Lead")}, 'lead', 10, (${lit(earlier)}::date + time '12:00') at time zone public.business_tz())`);

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1500 });
  const rows = () => admin.ev(`[...document.querySelectorAll('[data-recent-developed] [data-developed-row]')]
    .map((r) => r.innerText.replace(/\\s+/g, ' ')).filter((t) => t.includes(${JSON.stringify(TAG)}))`);
  const has = (list, name) => list.some((t) => t.includes(`${TAG} ${name}`));

  section("Today, to begin with");
  await admin.go("/", 6000);
  const day = await until(async () => ((await rows()).length >= 2 ? rows() : null));
  check("today's leads and appointments, not the older one", day && has(day, "Plumbing") && has(day, "Roofing") && !has(day, "Older Co"), day);
  const p = (day ?? []).find((t) => t.includes("Plumbing")) ?? "";
  check("…each with its client, project, call result, ultimate X-date, manager and when, with what it was",
    p.includes(`${TAG} Insurance`) && p.includes(`${TAG} DBDev`) && /Lead-Hot Lead/i.test(p) && p.includes("Mar 15") && p.includes("Sean Fitzgerald") && /\d:\d\d [AP]M Hot Lead/.test(p), p);
  check("the old six-newest-leads tile is gone", !(await admin.text()).includes("Search recent leads"));
  // By project (Sean, Oct 2026): a drop-down of check boxes, several at once.
  const pickMulti = (key, value) => admin.ev(`(() => {
    const box = document.querySelector('[data-recent-developed] [data-multi-facet="${key}"]');
    if (!box) return false;
    if (!document.querySelector('[data-multi-facet-list="${key}"]')) box.querySelector('button').click();
    return true; })()`).then(() => until(() => admin.ev(`(() => {
    const o = [...document.querySelectorAll('[data-multi-facet-list="${key}"] [data-option]')].find((b) => b.dataset.option === ${JSON.stringify(value)});
    if (!o) return false; o.click(); return true; })()`)));
  const byProject = await pickMulti("project", `${TAG} Other DBDev`);
  const one = await until(async () => { const r = await rows(); return r.length === 1 ? r : null; });
  check("a Project filter: that project's alone", byProject && one && has(one, "Glass"), JSON.stringify(one ?? await rows()));
  // Export CSV: what is shown, as filtered (the file read as the page makes it).
  await admin.ev(`window.__csv = null; window.__csvName = null; const make = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { b.text().then((t) => { window.__csv = t; }); return make(b); };
    const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__csvName = this.download; return; } return click.call(this); };`);
  await admin.click("[data-recent-developed] [data-export-csv]");
  const csv = await until(() => admin.ev("window.__csv"));
  const lines = (csv ?? "").replace(/^\ufeff/, "").trim().split(/\r\n/);
  check("Export CSV: the rows as filtered, with each one's pay", lines.length === 2 && lines[0].startsWith("Date,Time,Type,Manager,Company")
    && lines[1].includes(`${TAG} Glass`) && lines[1].includes(`${TAG} Other DBDev`) && lines[1].endsWith(",10.00"), JSON.stringify(lines));
  check("…named for what and which days", /^Leads-and-appointments_\d{4}-\d{2}-\d{2}\.csv$/.test((await admin.ev("window.__csvName")) ?? ""), await admin.ev("window.__csvName"));
  await admin.go("/", 4000);

  section("Several projects, clients, a Sales Rep");
  await pickMulti("project", `${TAG} Other DBDev`);
  await pickMulti("project", `${TAG} DBDev`);
  const two = await until(async () => { const r = await rows(); return r.length === 3 ? r : null; });
  check("Projects: several at once, ticked", two && has(two, "Plumbing") && has(two, "Glass") && !has(two, "Tile"), JSON.stringify(two ?? await rows()));
  await admin.go("/", 5000);
  await pickMulti("client", `${TAG} Second, Inc.`);
  const second = await until(async () => { const r = await rows(); return r.length === 1 ? r : null; });
  check("Clients: a name with a comma in it, alone", second && has(second, "Tile"), JSON.stringify(second ?? await rows()));
  await pickMulti("client", `${TAG} Insurance`);
  const both = await until(async () => { const r = await rows(); return r.length === 4 ? r : null; });
  check("…and two clients at once", Boolean(both), JSON.stringify(await rows()));
  await admin.go("/", 5000);
  await until(() => admin.ev("!!document.querySelector('[data-recent-developed] select[aria-label=\"Filter by Sales Rep\"]')"));
  await admin.ev(`(() => { const sel = document.querySelector('[data-recent-developed] select[aria-label="Filter by Sales Rep"]');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, 'Sean Fitzgerald'); sel.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  const rep = await until(async () => { const r = await rows(); return r.length === 1 ? r : null; });
  check("Sales Rep: the clients they own", rep && has(rep, "Tile"), JSON.stringify(rep ?? await rows()));
  await admin.go("/", 4000);

  section("Leads, appointments or both");
  await admin.click('[data-period-switch="rk"] a', "Leads");
  const leads = await until(async () => { const r = await rows(); return r.length && !has(r, "Roofing") ? r : null; });
  check("Leads: the lead alone", leads && has(leads, "Plumbing") && !has(leads, "Roofing"), leads);
  await admin.click('[data-period-switch="rk"] a', "Appointments");
  const appts = await until(async () => { const r = await rows(); return r.length && !has(r, "Plumbing") ? r : null; });
  check("Appointments: the appointment alone", appts && has(appts, "Roofing") && !has(appts, "Plumbing"), appts);

  section("A week, or days of one's own");
  await admin.go(`/?rk=lead&rl=custom&rf=${earlier}&rt=${today}`, 5000);
  const custom = await until(async () => { const r = await rows(); return has(r, "Older Co") ? r : null; });
  check("a range of days: the older lead too", custom && has(custom, "Older Co") && has(custom, "Plumbing"), custom);
  check("…its days shown in place of the day navigator", await admin.ev("Boolean(document.querySelector('[data-recent-developed] [data-recent-range]'))"));
  await admin.go(`/?rk=lead&rl=day&rd=${earlier}`, 5000);
  const back = await until(async () => { const r = await rows(); return has(r, "Older Co") ? r : null; });
  check("a day gone by: only what was developed that day", back && has(back, "Older Co") && !has(back, "Plumbing"), back);
} finally {
  await browser.close();
  sql(`delete from public.pay_events where project_id in (${project}, ${other}, ${third})`);
  sql(`delete from public.call_records where project_id in (${project}, ${other}, ${third})`);
  sql(`delete from public.insurance_details where lead_id in (${plumbing}, ${roofing}, ${older})`);
  sql(`delete from public.leads where project_id in (${project}, ${other}, ${third})`);
  sql(`delete from public.projects where id in (${project}, ${other}, ${third})`);
  sql(`delete from public.companies where id in (${company}, ${company2})`);
}
finish("admin recent leads & appointments");
