/**
 * A name whose stage and project disagree (its project's type was changed
 * before changing a type moved its names along): the lead sheet says so,
 * and an administrator is shown where to correct the project. A name that
 * fits its project shows no such note.
 *
 * Removes everything it made.
 *
 *   node tests/e2e/stage-mismatch.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `MISMATCH-E2E ${Date.now()}`;
const type = (code) => Number(sql(`select id from public.project_types where code = ${lit(code)}`));
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Co`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Project`)}, ${company}, ${type("APPT")}, 1) returning id`));
const odd = Number(sql(`insert into public.leads (project_id, company_name) values (${project}, ${lit(`${TAG} Odd`)}) returning id`));
const fits = Number(sql(`insert into public.leads (project_id, company_name) values (${project}, ${lit(`${TAG} Fits`)}) returning id`));
// As on the live site: a DB dev name left in a project now set to Appointment Setting.
sql(`update public.leads set stage = 'dbdev' where id = ${odd}`);

const browser = await launchBrowser();
try {
  section("A name whose stage and project disagree");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await admin.go(`/leads/${odd}`, 4000);
  const note = await until(() => admin.ev(`document.querySelector('[data-stage-mismatch]')?.innerText ?? null`));
  check("the sheet says the name is at the DB dev stage while its project is set to appointment setting",
    /database development stage/i.test(note ?? "") && /appointment setting/i.test(note) && note.includes(`${TAG} Project`), note);
  check("…and shows the administrator the way to the project", Boolean(await admin.ev(`!!document.querySelector('[data-stage-mismatch] a[href="/projects/${project}"]')`)));
  await admin.go(`/leads/${fits}`, 4000);
  await until(() => admin.ev(`/Call result/i.test(document.body.innerText)`));
  check("a name that fits its project has no such note", !(await admin.ev(`!!document.querySelector('[data-stage-mismatch]')`)));
} finally {
  browser.close();
  sql(`delete from public.leads where id in (${odd}, ${fits})`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("stage mismatch");
