/**
 * Making a project from another's details (Sean, Nov 2026: "for every lead project there has to be an
 * appointment project… most of the time this information is gonna be the same"), and Program Funding
 * filled in as a project is made, not only once it is saved.
 *
 * New project: Program Funding is there from the start. "Use a project's details" picks the appointment
 * project (the client's first) and fills in everything but the name and type: the office, status, contract
 * value, dates, goals, billing, Program Funding and delivery; a lead project promotes to it. Saved, the new
 * project has them all, its Program Funding too.
 *
 *   node tests/run.mjs tests/e2e/project-from-project.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const SHOTS = process.env.SHOTS;
const TAG = `PFP-TEST ${Date.now()}`;
const typeId = (c) => sql(`select id from public.project_types where code=${lit(c)}`);
const MST = sql("select id from public.timezones where name = 'EST'");
const ACTIVE = sql("select id from public.project_statuses where name = 'Active'");
const co = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Capital Insurance`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, amount_paid, start_date, end_date,
    lead_goal, appt_goal, lead_goal_month, appt_goal_month, projected_conversion, bill_lead_rate, bill_appointment_rate, email, appt_texts,
    contact_name, contact_title, phone, address, city, state, zip, timezone_id, description)
  values (${lit(`${TAG} Michigan Appts`)}, ${co}, ${typeId("APPT")}, ${ACTIVE}, 12000, '2024-10-28', '2026-12-31',
    700, 150, 20, 5, 15, 15, 75, ${lit(`leads+${Date.now()}@capital.test`)}, true,
    'Pat Frederick', 'Producer', '602-762-7665', '892 W Broadway Ave', 'Muskegon', 'MI', '49441', ${MST}, 'Michigan office')
  returning id`));
sql(`insert into public.project_funding (project_id, plan, leads, appts, appts_included, setup_fee, list_fee, payments, first_due, due_day, billing)
  values (${APPT}, 'installments', 700, 150, true, 500, 250, 6, '2024-11-01', 1, 'monthly')`);
const cols = `status_id, amount_paid, start_date, end_date, lead_goal, appt_goal, lead_goal_month, appt_goal_month, projected_conversion,
  bill_lead_rate, bill_appointment_rate, email, appt_texts, contact_name, contact_title, phone, address, city, state, zip, timezone_id, description`;
const row = (where) => JSON.parse(sql(`select coalesce(row_to_json(t)::text, 'null') from (select ${cols} from public.projects where ${where}) t`) || "null");
const plan = (id) => JSON.parse(sql(`select coalesce(row_to_json(t)::text, 'null') from (select plan, leads, appts, appts_included, setup_fee, list_fee, payments, first_due, due_day, billing from public.project_funding where project_id = ${id}) t`) || "null");
const made = [];

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });
  const f = (sel) => `[data-dialog-content] ${sel}`;
  const val = (sel) => admin.ev(`document.querySelector(${JSON.stringify(f(sel))})?.value ?? null`);
  await admin.go("/projects", 6000);
  await admin.click("button", "New project");
  await until(() => admin.ev(`!!document.querySelector(${JSON.stringify(f('input[name="name"]'))})`), { timeout: 15000 });

  section("New project: Program Funding from the start");
  check("its Program Funding is on the form before saving", await admin.ev(`!!document.querySelector(${JSON.stringify(f("[data-funding-form]"))})`));

  section("Use a project's details");
  await admin.fill(f('input[name="name"]'), `${TAG} Michigan DBDev`);
  await admin.fill(f('select[name="company_id"]'), String(co));
  await admin.fill(f('select[name="project_type_id"]'), typeId("DBDV"));
  await sleep(300);
  const first = await admin.ev(`(() => { const s = document.querySelector(${JSON.stringify(f("[data-use-project-pick]"))}); const g = s?.querySelector('optgroup'); return g ? { label: g.label, first: g.querySelector('option')?.value } : null; })()`);
  check("the client's own projects listed first", first?.label === "This client" && first.first === String(APPT), JSON.stringify(first));
  await admin.fill(f("[data-use-project-pick]"), String(APPT));
  check("filled in", Boolean(await until(async () => (await val('input[name="contact_name"]')) === "Pat Frederick", { timeout: 10000 })));
  check("…the name and type as typed", (await val('input[name="name"]')) === `${TAG} Michigan DBDev` && (await val('select[name="project_type_id"]')) === typeId("DBDV"));
  check("…the office", (await val('input[name="phone"]')) === "602-762-7665" && (await val('input[name="city"]')) === "Muskegon" && (await val('select[name="timezone_id"]')) === MST);
  check("…status, contract value, dates", (await val('select[name="status_id"]')) === ACTIVE && Number(await val('input[name="amount_paid"]')) === 12000
    && (await val('input[name="start_date"]')) === "2024-10-28" && (await val('input[name="end_date"]')) === "2026-12-31");
  check("…goals and billing", (await val('[data-lead-goal]')) === "700" && (await val('[data-appt-goal-month]')) === "5" && Number(await val('[data-bill-lead-rate]')) === 15
    && Number(await val('[data-bill-appointment-rate]')) === 75 && Number(await val('[data-projected-conversion]')) === 15);
  check("…Program Funding", (await val('select[name="funding_plan"]')) === "installments" && Number(await val('input[name="funding_setup_fee"]')) === 500
    && Number(await val('input[name="funding_list_fee"]')) === 250, `${await val('select[name="funding_plan"]')} ${await val('input[name="funding_setup_fee"]')}`);
  check("…delivery", ((await val('input[name="email"]')) ?? "").startsWith("leads+") && await admin.ev(`document.querySelector(${JSON.stringify(f("[data-project-appt-texts]"))}).checked`));
  check("…and it promotes its leads to that appointment project", (await val('select[name="appt_project_id"]')) === String(APPT));
  if (SHOTS) await admin.screenshot(`${SHOTS}/project-from-project.png`);

  section("Saved: the new project has them all");
  await admin.click(f('button[type="submit"]'), "Create project");
  const id = Number(await until(() => sql(`select coalesce(max(id)::text, '') from public.projects where name = ${lit(`${TAG} Michigan DBDev`)}`) || null, { timeout: 15000 }));
  if (id) made.push(id);
  const a = row(`id = ${APPT}`);
  const b = row(`id = ${id}`);
  const differs = Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b?.[k]));
  check("created", id > 0);
  check("…every detail the same as the appointment project's", differs.length === 0, `differs: ${differs.map((k) => `${k} ${JSON.stringify(a[k])}→${JSON.stringify(b?.[k])}`).join(", ")}`);
  check("…a lead project, promoting to it", sql(`select t.code || ':' || p.appt_project_id from public.projects p join public.project_types t on t.id = p.project_type_id where p.id = ${id}`) === `DBDV:${APPT}`);
  check("…its Program Funding saved with it", JSON.stringify(plan(id)) === JSON.stringify(plan(APPT)), `${JSON.stringify(plan(id))} vs ${JSON.stringify(plan(APPT))}`);
} finally {
  browser.close();
  const ids = [APPT, ...made].join(",");
  sql(`delete from public.project_payments where project_id in (${ids})`);
  sql(`delete from public.project_funding where project_id in (${ids})`);
  sql(`delete from public.activity_log where entity = 'project' and entity_id in (${ids})`);
  sql(`delete from public.projects where id in (${made.length ? made.join(",") : 0})`);
  sql(`delete from public.projects where id = ${APPT}`);
  sql(`delete from public.companies where id = ${co}`);
}

finish("project from project");
