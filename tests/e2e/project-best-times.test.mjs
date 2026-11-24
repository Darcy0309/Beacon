/**
 * Best Times to Call on a project's page (Darcy, Nov 2026): its best hours and those to avoid, from its own calls in
 * the business's local time; a new project's from its industry's. On its page for an administrator, and on its call list
 * for the managers on it (they don't open /projects); not a client.
 *
 *   node tests/run.mjs tests/e2e/project-best-times.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `PBT${Date.now()}`;
const SEAN = Number(sql(`select id from public.users where email = 'sean@beacon.test'`));
const result = (type, name) => sql(`select id from public.call_results where project_type = '${type}' and name = ${lit(name)}`);
const NONE = result("DBDV", "Viable-CallBack");
const LEAD = result("DBDV", "Lead");
const TUE = sql(`select (date_trunc('week', public.business_today()) - interval '6 days')::date::text`);
const co = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Capital Ins`)}) returning id`));
const project = (name) => Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} ${name}`)}, ${co},
  (select id from public.project_types where code = 'DBDV'), 1) returning id`));
const P = project("Worked");
const NEW = project("New");
// SIC 99xx: an industry only these leads are in.
const WI = Number(sql(`insert into public.leads (company_name, project_id, state, sic_code) values (${lit(`${TAG} WI Co`)}, ${P}, 'WI', '9911') returning id`));
sql(`insert into public.leads (company_name, project_id, state, sic_code) values (${lit(`${TAG} New Co`)}, ${NEW}, 'WI', '9912')`);
const calls = (hour, n, won) => sql(`insert into public.call_records (lead_id, project_id, user_id, call_date, call_result, result_id)
  select ${WI}, ${P}, ${SEAN}, ((${lit(TUE)}::date + time '${String(hour).padStart(2, "0")}:15') at time zone 'America/Chicago') + (i || ' seconds')::interval,
         'x', case when i <= ${won} then ${LEAD} else ${NONE} end from generate_series(1, ${n}) i`);
calls(8, 25, 5);
calls(10, 25, 2);
calls(12, 25, 0);
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${P}, ${SEAN})`);
const clientCompany = sql(`select coalesce(company_id::text, 'null') from public.users where email = 'client@beacon.test'`);

const card = (page) => page.ev(`(() => { const c = document.querySelector('[data-project-best-times]'); return c ? { basis: c.dataset.projectBestTimes,
  note: c.querySelector('[data-best-basis]').textContent, top: [...c.querySelectorAll('[data-best-top] [data-best-hour]')].map((x) => x.dataset.bestHour),
  avoid: [...c.querySelectorAll('[data-best-avoid] [data-best-hour]')].map((x) => x.dataset.bestHour), text: c.innerText.replace(/\\s+/g, ' '),
  report: c.querySelector('[data-best-times-report]')?.getAttribute('href') } : null; })()`);

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });
  section("From the project's own calls");
  await admin.go(`/projects/${P}`, 8000);
  const c = await until(() => card(admin), { timeout: 20000 });
  check("its own calls", c?.basis === "project" && /From 75 calls in the last year on this project/.test(c.note), JSON.stringify(c));
  check("best: Tuesday 8–9 AM, 20%", c?.top?.[0] === "2-8" && /Tue 8–9 AM/.test(c.text) && /20\.0%/.test(c.text), JSON.stringify(c?.top));
  check("to avoid: Tuesday noon", c?.avoid?.[0] === "2-12", JSON.stringify(c?.avoid));
  check("…and the heat map for it", (c?.report ?? "").startsWith(`/reports/heat-map?project=${P}&`), c?.report);

  section("A new project: its industry's");
  await admin.go(`/projects/${NEW}`, 8000);
  const n = await until(() => card(admin), { timeout: 20000 });
  check("from its industry's calls (SIC 99), as it's new", n?.basis === "industry" && /SIC 99\), as it's new/.test(n.note) && n.top[0] === "2-8", JSON.stringify(n));

  section("Who sees it");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await sean.go(`/work/${P}`, 8000);
  const m = await until(() => card(sean), { timeout: 20000 });
  check("a manager on the project, on its call list", m?.top?.[0] === "2-8", JSON.stringify(m));
  sql(`update public.users set company_id = ${co} where email = 'client@beacon.test'`);
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await client.go(`/projects/${P}`, 8000);
  await until(() => client.ev(`!!document.querySelector('[data-project-cards]')`), { timeout: 20000 });
  check("not a client", !(await client.ev(`!!document.querySelector('[data-project-best-times]')`)));
} finally {
  browser.close();
  sql(`update public.users set company_id = ${clientCompany} where email = 'client@beacon.test'`);
  sql(`delete from public.project_assignments where project_id in (${P}, ${NEW})`);
  sql(`delete from public.call_records where project_id in (${P}, ${NEW})`);
  sql(`delete from public.leads where project_id in (${P}, ${NEW})`);
  sql(`delete from public.projects where id in (${P}, ${NEW})`);
  sql(`delete from public.companies where id = ${co}`);
}

finish("project best times");
