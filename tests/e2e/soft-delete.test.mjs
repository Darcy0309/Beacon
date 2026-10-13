/**
 * Deleting in the app (Oct 2026): on Projects the name opens the project,
 * and the menu on the right edits or deletes it; Delete asks first and says
 * what will happen; the project and its names leave every list but stay in
 * the database; an administrator finds it under Settings › Deleted Records
 * and restores it, names and all. And signing out asks first.
 *
 *   node tests/run.mjs tests/e2e/soft-delete.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const SHOTS = process.env.SHOTS;
const TAG = `sdel${Date.now()}`;
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const NAME = `${TAG} Car Wash`;
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(NAME)}, ${company}, (select id from public.project_types where code='DBDV'), 1) returning id`));
sql(`insert into public.leads (company_name, project_id, result_id) select ${lit(`${TAG} Name `)} || n, ${project},
  (select id from public.call_results where project_type='DBDV' and name='Viable-CallBack') from generate_series(1, 3) n`);
const flag = () => sql(`select (select count(*) from public.projects where id = ${project} and deleted_at is not null) || '/' || (select count(*) from public.leads where project_id = ${project} and deleted_at is not null) || '/' || (select count(*) from public.leads where project_id = ${project})`);

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });
  const shot = (name) => (SHOTS ? admin.screenshot(`${SHOTS}/${name}.png`) : null);
  const rowText = () => admin.ev(`document.body.innerText.includes(${JSON.stringify(NAME)})`);

  section("Projects: the name opens the project");
  await admin.go(`/projects?q=${TAG}`, 5000);
  const link = await until(() => admin.ev(`(() => { const a = [...document.querySelectorAll('a[data-project-link]')].find((e) => e.textContent.trim() === ${JSON.stringify(NAME)}); return a ? a.getAttribute('href') : null; })()`));
  check("the project's name is a link to its page", link === `/projects/${project}`, String(link));
  await admin.ev(`[...document.querySelectorAll('a[data-project-link]')].find((e) => e.textContent.trim() === ${JSON.stringify(NAME)}).click()`);
  check("…which opens it", Boolean(await until(async () => (await admin.path()) === `/projects/${project}`)), await admin.path());

  section("Delete asks first");
  await admin.go(`/projects?q=${TAG}`, 5000);
  await until(() => admin.pointer(`button[aria-label="Actions for ${NAME}"]`));
  await sleep(500);
  const items = await admin.ev(`[...document.querySelectorAll('[role=menuitem]')].map((e) => e.textContent.trim())`);
  check("the menu on the right still opens, edits and deletes", JSON.stringify(items) === JSON.stringify(["Open", "Edit", "Delete"]), JSON.stringify(items));
  await admin.menuItem("Delete");
  const asked = await until(() => admin.ev(`[...document.querySelectorAll('[role=dialog]')].map((d) => d.innerText).find((t) => /Delete /.test(t)) ?? null`));
  check("a warning asks whether to delete it, by name", new RegExp(`Delete ${NAME}\\?`).test(asked ?? ""), asked);
  check("…and says what happens: its 3 names go with it, nothing is erased, an administrator can restore it",
    /with its 3 names and their appointments/.test(asked ?? "") && /Nothing is erased/.test(asked ?? "") && /Settings › Deleted records/.test(asked ?? ""), asked);
  await shot("delete-project-confirm");
  check("nothing has happened yet", flag() === "0/0/3");
  await admin.click("[role=dialog] button", "Cancel");
  await sleep(400);
  check("Cancel leaves it alone", flag() === "0/0/3" && (await rowText()));

  section("Deleting it");
  await admin.pointer(`button[aria-label="Actions for ${NAME}"]`);
  await sleep(500);
  await admin.menuItem("Delete");
  await sleep(600);
  await admin.click("[role=dialog] button", "Delete");
  check("the project and its names are flagged as deleted; every row is still in the database", Boolean(await until(() => flag() === "1/3/3", { timeout: 8000 })), flag());
  check("it is off the Projects list", Boolean(await until(async () => !(await rowText()))));
  await admin.go(`/leads?q=${TAG}`, 5000);
  check("its names are off the Leads list", !(await admin.ev(`document.body.innerText.includes(${JSON.stringify(`${TAG} Name`)})`)));
  await admin.go(`/projects/${project}`, 4000);
  check("its page is gone", /not found|could not be found|404/i.test(await admin.text()), (await admin.text()).slice(0, 120));
  check("the delete is in the activity log, with its name", sql(`select count(*) from public.activity_log where action = 'project.delete' and entity_id = ${project} and detail = ${lit(NAME)}`) === "1");

  section("Settings › Deleted Records");
  await admin.go("/settings", 6000);
  const listed = await until(() => admin.ev(`document.querySelector('[data-deleted="projects:${project}"]')?.innerText.replace(/\\s+/g, ' ') ?? null`));
  check("the project is listed: its client, what went with it, when and by whom", new RegExp(`${NAME} ${TAG} Insurance · 3 records went with it Project`).test(listed ?? "") && /Restore/i.test(listed ?? ""), listed);
  check("its names are not listed one by one", (await admin.ev(`document.querySelectorAll('[data-deleted^="leads:"]').length`)) === Number(sql("select count(*) from public.leads where deleted_at is not null and deleted_via is null")));
  await admin.ev(`document.querySelector('[data-deleted="projects:${project}"]').scrollIntoView({ block: 'center' })`);
  await shot("deleted-records");
  await admin.click(`[data-deleted="projects:${project}"] [data-restore]`);
  const restoring = await until(() => admin.ev(`document.querySelector('[data-confirm-dialog]')?.innerText ?? null`));
  check("Restore asks first, and says what comes back", new RegExp(`Restore ${NAME}\\?`).test(restoring ?? "") && /with 3 records of its own/.test(restoring ?? "") && flag() === "1/3/3", restoring);
  await admin.click("[data-confirm-dialog] [data-confirm]");
  check("restored: the project and its names are live again", Boolean(await until(() => flag() === "0/0/3", { timeout: 8000 })), flag());
  check("…and off the deleted list", Boolean(await until(() => admin.ev(`!document.querySelector('[data-deleted="projects:${project}"]')`))));
  await admin.go(`/projects?q=${TAG}`, 5000);
  check("…back on Projects, with its names counted", Boolean(await until(async () => (await rowText()))) && /\b3\b/.test(await admin.ev(`[...document.querySelectorAll('tr')].find((r) => r.innerText.includes(${JSON.stringify(NAME)}))?.innerText ?? ''`)));
  check("the restore is in the activity log", sql(`select count(*) from public.activity_log where action = 'record.restore' and entity_id = ${project}`) === "1");

  section("A manager");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await sean.go("/settings", 4000);
  check("has no Deleted Records to open", !(await sean.ev(`!!document.querySelector('[data-deleted-records]')`)));
  sean.close();

  section("Signing out asks first");
  await admin.ev(`document.querySelector('button[aria-label="Sign out"]').click()`);
  const leaving = await until(() => admin.ev(`document.querySelector('[data-confirm-dialog]')?.innerText ?? null`));
  check("a dialog asks whether to sign out", /Sign out of Lighthouse\?/.test(leaving ?? ""), leaving);
  await shot("sign-out-confirm");
  await admin.click("[data-confirm-dialog] [data-confirm-cancel]");
  await sleep(500);
  check("Cancel keeps you signed in", !(await admin.ev(`!!document.querySelector('[data-confirm-dialog]')`)) && (await admin.path()) === "/projects");
  await admin.ev(`document.querySelector('button[aria-label="Sign out"]').click()`);
  await until(() => admin.ev(`!!document.querySelector('[data-confirm-dialog] form [data-confirm]')`));
  await admin.click("[data-confirm-dialog] form [data-confirm]");
  check("Sign out signs out", Boolean(await until(async () => (await admin.path()) === "/login", { timeout: 10000 })), await admin.path());
} finally {
  browser.close();
  sql(`delete from public.activity_log where entity_id = ${project} and action in ('project.delete', 'record.restore')`);
  sql(`delete from public.leads where company_name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("soft delete (browser)");
