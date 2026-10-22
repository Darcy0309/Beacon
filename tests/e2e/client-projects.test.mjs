/**
 * A client's Projects (Sean, Oct 2026): their own projects only, as an
 * administrator has them, without what is ours: no new, edit or delete, no
 * description (our billing notes), no pay, no reps, no Assigned filter, no
 * other clients' filters or contract value. Their figures count the calls on
 * their projects too.
 *
 *   npm run test:e2e
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `CP-TEST ${Date.now()}`;
const CLIENT = Number(sql("select id from public.users where email='client@beacon.test'"));
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const clientCompany = sql(`select coalesce(company_id::text, 'null') from public.users where id=${CLIENT}`);
const typeId = (c) => sql(`select id from public.project_types where code=${lit(c)}`);
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const other = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Someone Else`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, amount_paid) values (${lit(`${TAG} Appointments`)}, ${company}, ${typeId("APPT")}, 1, 50000) returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id, description) values (${lit(`${TAG} DBDev`)}, ${company}, ${typeId("DBDV")}, 1, ${APPT}, 'Database Development + Appointment Setting, billed monthly') returning id`));
const THEIRS = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Not Yours`)}, ${other}, ${typeId("APPT")}, 1) returning id`));
sql(`update public.users set company_id = ${company} where id = ${CLIENT}`);
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${DBDV}, ${SEAN})`);
const viable = sql("select id from public.call_results where project_type = 'DBDV' and viable and callable order by id limit 1");
const L = Number(sql(`insert into public.leads (company_name, project_id, assigned_user_id, result_id) values (${lit(`${TAG} Fusion Air`)}, ${DBDV}, ${SEAN}, ${viable}) returning id`));
const MONTH = 6;
sql(`insert into public.insurance_details (lead_id, ultimate_xdate) values (${L}, make_date(extract(year from current_date)::int + 1, ${MONTH}, 15))`);
sql(`insert into public.call_records (user_id, project_id, lead_id, call_date, notes) values (${SEAN}, ${DBDV}, ${L}, now() - interval '1 hour', ${lit(TAG)}), (${SEAN}, ${DBDV}, ${L}, now() - interval '2 hours', ${lit(TAG)})`);

const browser = await launchBrowser();
const when = (page, expr, timeout = 20000) => until(() => page.ev(expr), { timeout });
const text = (page) => page.ev("(document.querySelector('main') ?? document.body).innerText.replace(/\\s+/g, ' ')");
try {
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1440, height: 1000 });

  section("Projects, in their menu: their own");
  await client.go("/dashboard", 3000);
  await client.go("/projects", 6000);
  await when(client, "!!document.querySelector('[data-project-link]')");
  const names = await client.ev("[...document.querySelectorAll('[data-project-link]')].map((a) => a.textContent)");
  check("Projects is in their menu", Boolean(await client.ev("!!document.querySelector('aside nav a[href=\"/projects\"]')")));
  check("their own projects, not another client's", names.some((n) => n.includes(`${TAG} DBDev`)) && names.some((n) => n.includes(`${TAG} Appointments`)) && !names.some((n) => n.includes("Not Yours")), JSON.stringify(names));
  const list = await text(client);
  check("no New project, no edit or delete, no Contract Value, no Client filter", !/New project/.test(list) && !/Contract Value/.test(list)
    && !(await client.ev("!!document.querySelector('[data-row-actions], button[aria-label*=\"actions\" i]')")) && !/Agency group/.test(list), list.slice(0, 300));

  section("A project of theirs");
  await client.go(`/projects/${DBDV}`, 7000);
  const page = (await when(client, "document.querySelector('[data-project-cards]') && (document.querySelector('main') ?? document.body).innerText.replace(/\\s+/g, ' ')")) ?? "";
  check("its figures, call results, calendar, Project Info, X-dates and leads", /Names Left to Call/.test(page) && /Project Calendar/.test(page) && /X-Dates by Month/.test(page) && /Leads on this Project/.test(page), page.slice(0, 300));
  check("…its calls counted for them too", /Calls This Month 2/.test(page), page.match(/Calls This Month[^A-Z]*/)?.[0]);
  check("no description (our billing notes)", !/billed monthly/.test(page));
  check("no pay rates or pay line, no Edit", !(await client.ev("!!document.querySelector('[data-rates]')")) && !/Pay rates/i.test(page) && !(await client.ev("[...document.querySelectorAll('button')].some((b) => /^\\s*Edit\\s*$/.test(b.textContent))")));
  check("no reps on the project, nor their names", !/Reps on this Project/i.test(page) && !/across \d+ reps?/.test(page));
  check("leads on it, without the Assigned filter", /Fusion Air/.test(page) && !(await client.ev("!!document.querySelector('select[aria-label=\"Filter by Assigned\"]')")));
  check("…with the manager on each lead (not Unassigned)", Boolean(await client.ev(`[...document.querySelectorAll('tr')].some((r) => r.textContent.includes(${JSON.stringify(`${TAG} Fusion Air`)}) && /Sean F\./.test(r.textContent))`)));
  check("X-date months open their names, as for administrators", Boolean(await client.ev("!!document.querySelector('a[href^=\"/reports/x-dates?project=\"]')")));
  await client.go(`/reports/x-dates?project=${DBDV}&month=${MONTH}#names`, 6000);
  const monthNames = (await when(client, "(document.querySelector('main') ?? document.body).innerText.includes('Fusion Air') && (document.querySelector('main') ?? document.body).innerText.replace(/\\s+/g, ' ')")) ?? "";
  check("…the month's names, with their manager, and back to the project", /Fusion Air/.test(monthNames) && /Sean F\./.test(monthNames)
    && (await client.ev("document.querySelector('[data-back-to-project]')?.getAttribute('href')")) === `/projects/${DBDV}`, monthNames.slice(0, 200));
  check("…no client picker for them", !(await client.ev("[...document.querySelectorAll('button, select')].some((b) => /All clients/.test(b.textContent))")));
  await client.go(`/reports/x-dates?project=${THEIRS}&month=${MONTH}#names`, 5000);
  check("…and nothing of another client's", !/Not Yours/.test(await text(client)) || !/Fusion|Someone/.test(await text(client)));

  section("Not someone else's");
  await client.go(`/projects/${THEIRS}`, 5000);
  check("another client's project is not found", /could not be found|not found|404/i.test(await text(client)));

  section("Administrators, as before");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await admin.go(`/projects/${DBDV}`, 7000);
  const theirs = (await when(admin, "document.querySelector('[data-project-cards]') && (document.querySelector('main') ?? document.body).innerText.replace(/\\s+/g, ' ')")) ?? "";
  check("the description, pay, Edit and reps all there", /billed monthly/.test(theirs) && Boolean(await admin.ev("!!document.querySelector('[data-rates]')")) && /Reps on this Project/i.test(theirs));
} finally {
  browser.close();
  sql(`update public.users set company_id = ${clientCompany} where id = ${CLIENT}`);
  sql(`delete from public.call_records where notes = ${lit(TAG)}`);
  sql(`delete from public.insurance_details where lead_id = ${L}`);
  sql(`delete from public.leads where company_name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.project_assignments where project_id in (${DBDV}, ${APPT}, ${THEIRS})`);
  sql(`update public.projects set appt_project_id = null where id = ${DBDV}`);
  sql(`delete from public.projects where id in (${DBDV}, ${APPT}, ${THEIRS})`);
  sql(`delete from public.companies where id in (${company}, ${other})`);
}

finish("client projects");
