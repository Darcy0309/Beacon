/**
 * The Appointments page's list (Sean, Oct 2026): each appointment opens its
 * lead; one row shows the company, client, project, agent, status and the
 * manager who set it; filtered by client, project, manager, status and the
 * appointment days (the next 7 to begin with). Invalid ones only when asked
 * for. A client's row opens the appointment on their calendar.
 *
 * Removes everything it made.
 *
 *   node tests/run.mjs tests/e2e/appointments-list.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `APL ${Date.now()}`;
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const [SEAN, MIKE] = [userId("sean@beacon.test"), userId("mike@beacon.test")];
const typeId = (code) => sql(`select id from public.project_types where code=${lit(code)}`);
const statusId = (name) => sql(`select id from public.appointment_statuses where name=${lit(name)}`);
const inDays = (n) => sql(`select ((now() at time zone public.business_tz())::date + ${n})::text`);
const clientCompany = Number(sql("select company_id from public.users where email='client@beacon.test'"));
const other = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Other Insurance`)}) returning id`));
const project = (name, company) => Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} ${name}`)}, ${company}, ${typeId("APPT")}, 1) returning id`));
const [MINE, THEIRS] = [project("Maricopa Appts", clientCompany), project("Pima Appts", other)];
const clientName = sql(`select name from public.companies where id = ${clientCompany}`);
const appt = (name, proj, day, time, status, setter, agent, invalid = false) => {
  const lead = Number(sql(`insert into public.leads (company_name, contact_name, city, state, project_id, stage) values (${lit(`${TAG} ${name}`)}, 'Dana', 'Phoenix', 'AZ', ${proj}, 'appt') returning id`));
  const id = Number(sql(`insert into public.appointments (lead_id, user_id, project_id, appt_date, appt_time, duration_min, rep_name, status_id, qa_status, invalid_at)
    values (${lead}, ${setter}, ${proj}, ${lit(inDays(day))}, ${lit(time)}, 30, ${lit(agent)}, ${statusId(status)}, 'passed', ${invalid ? "now()" : "null"}) returning id`));
  return { lead, id };
};
const A = appt("Arizona Cleanpros", MINE, 1, "9:00 AM", "Scheduled", SEAN, "Bret Godsey");
const B = appt("Bell Stone Granite", MINE, 2, "11:00 AM", "Confirmed", MIKE, "Jacob Termini");
const C = appt("Cactus Roofing", THEIRS, 3, "1:00 PM", "Scheduled", MIKE, "Ann Lee");
const D = appt("Desert Glass", MINE, 20, "10:00 AM", "Scheduled", SEAN, "Bret Godsey");
const E = appt("Echo Plumbing", MINE, 2, "2:00 PM", "Scheduled", SEAN, "Bret Godsey", true);

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1600, height: 1100 });
  const shown = () => admin.ev(`[...document.querySelectorAll('[data-appointment-list] [data-appt-row]')].map((r) => r.innerText.replace(/\\s+/g, ' ')).filter((t) => t.includes(${JSON.stringify(TAG)}))`);
  const has = (list, name) => list.some((t) => t.includes(`${TAG} ${name}`));
  const open = async (query, expect) => {
    await admin.go(`/appointments${query}`, 4000);
    return until(async () => { const r = await shown(); return expect(r) ? r : null; }, { timeout: 6000 }).then((r) => r ?? shown());
  };

  section("The list, the next 7 days");
  const week = await open("", (r) => has(r, "Cactus Roofing"));
  check("the next 7 days, not later and not invalid", has(week, "Arizona Cleanpros") && has(week, "Bell Stone Granite") && has(week, "Cactus Roofing") && !has(week, "Desert Glass") && !has(week, "Echo Plumbing"), JSON.stringify(week));
  const cols = await admin.ev(`(() => { const r = document.querySelector('[data-appt-row="${A.id}"]'); return Object.fromEntries([...r.querySelectorAll('[data-col]')].map((c) => [c.dataset.col, c.innerText.trim()])); })()`);
  check("one row: client, project, agent, status, and the manager who set it at the far right",
    cols.client === clientName && cols.project === `${TAG} Maricopa Appts` && cols.agent === "Bret Godsey" && /scheduled/i.test(cols.status) && cols.manager === "Sean Fitzgerald", JSON.stringify(cols));
  check("…the manager last in the row", await admin.ev(`(() => { const r = document.querySelector('[data-appt-row="${A.id}"]'); const cells = [...r.querySelectorAll('[data-col]')]; return cells[cells.length - 1].dataset.col === 'manager'; })()`));
  await admin.click(`[data-appt-row="${A.id}"]`);
  check("an appointment opens its lead", Boolean(await until(async () => (await admin.path()) === `/leads/${A.lead}`, { timeout: 6000 })), await admin.path());

  section("Filters");
  const byClient = await open(`?client=${other}`, (r) => has(r, "Cactus Roofing"));
  check("by client", has(byClient, "Cactus Roofing") && !has(byClient, "Arizona Cleanpros"), JSON.stringify(byClient));
  const byProject = await open(`?project=${MINE}`, (r) => has(r, "Arizona Cleanpros"));
  check("by project", has(byProject, "Arizona Cleanpros") && has(byProject, "Bell Stone Granite") && !has(byProject, "Cactus Roofing"), JSON.stringify(byProject));
  const byManager = await open(`?manager=${MIKE}`, (r) => has(r, "Bell Stone Granite"));
  check("by the manager who set it", has(byManager, "Bell Stone Granite") && has(byManager, "Cactus Roofing") && !has(byManager, "Arizona Cleanpros"), JSON.stringify(byManager));
  const byStatus = await open(`?status=Confirmed`, (r) => has(r, "Bell Stone Granite"));
  check("by status", has(byStatus, "Bell Stone Granite") && !has(byStatus, "Arizona Cleanpros"), JSON.stringify(byStatus));
  const invalid = await open(`?status=Invalid`, (r) => has(r, "Echo Plumbing"));
  check("invalid ones when asked for", has(invalid, "Echo Plumbing") && !has(invalid, "Arizona Cleanpros"), JSON.stringify(invalid));
  const range = await open(`?from=${inDays(15)}&to=${inDays(25)}`, (r) => has(r, "Desert Glass"));
  check("by the appointment days", has(range, "Desert Glass") && !has(range, "Arizona Cleanpros"), JSON.stringify(range));
  await admin.go(`/appointments?client=${clientCompany}`, 4000);
  const projects = await admin.ev(`document.querySelector('[data-appointment-filters]').innerText`);
  check("a client chosen, its projects alone to pick from", Boolean(projects));

  section("A client");
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1600, height: 1100 });
  await client.go("/appointments", 4000);
  // Their own list (Sean, Oct 2026): as Recent Activity has it, each with how it went (client-appointments.jsx).
  const theirs = await until(async () => { const r = await client.ev(`[...document.querySelectorAll('[data-client-appt]')].map((r) => r.innerText).filter((t) => t.includes(${JSON.stringify(TAG)}))`); return r.length ? r : null; });
  check("sees their own appointments, not another client's", (theirs ?? []).some((t) => t.includes("Arizona Cleanpros")) && !(theirs ?? []).some((t) => t.includes("Cactus Roofing")), JSON.stringify(theirs));
  check("…each company opening its lead sheet", (await client.ev(`document.querySelector('[data-client-appt="${A.id}"] [data-appt-lead]')?.getAttribute('href')`))?.startsWith(`/leads/${A.lead}`));
  check("…with no client or manager filter", await client.ev(`!/All clients|Everyone/.test(document.querySelector('[data-appointment-filters]').innerText)`));
} finally {
  browser.close();
  sql(`delete from public.appointments where lead_id in (select id from public.leads where company_name like ${lit(`${TAG}%`)})`);
  sql(`delete from public.leads where company_name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.projects where name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.companies where id = ${other}`);
}
finish("appointments list");
