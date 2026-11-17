/**
 * Deleting a client (Sean, Nov 2026: "How do I delete clients? I deleted projects, but don't see a way"): Delete on
 * the client's page asks first and says what goes with it; the client, its projects and names, and its people's
 * logins (disabled) leave Lighthouse; its deletion list stays with it, hidden; restored, all of it comes back, the
 * logins as they were.
 *
 *   node tests/e2e/delete-client.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `dcl${Date.now()}`;
const NAME = `${TAG} Insurance`;
const SLUG = NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const company = Number(sql(`insert into public.companies (name) values (${lit(NAME)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} Trucking`)}, ${company}, (select id from public.project_types where code='DBDV'), 1) returning id`));
sql(`insert into public.leads (company_name, project_id, result_id) select ${lit(`${TAG} Name `)} || n, ${project},
  (select id from public.call_results where project_type='DBDV' and name='Viable-CallBack') from generate_series(1, 2) n`);
// Two of the client's people: one active, one disabled already (each back as it was).
const active = Number(sql(`insert into public.users (email, first_name, role, status, company_id) values (${lit(`${TAG}a@client.test`)}, 'Cal', 'client', 'active', ${company}) returning id`));
const off = Number(sql(`insert into public.users (email, first_name, role, status, company_id) values (${lit(`${TAG}b@client.test`)}, 'Dee', 'client', 'disabled', ${company}) returning id`));
sql(`insert into public.client_removals (company_id, reason, company_name) values (${company}, 'current_customer', ${lit(`${TAG} Removed Co`)})`);
const state = () => sql(`select (select count(*) from public.companies where id = ${company} and deleted_at is not null) || '/'
  || (select count(*) from public.projects where id = ${project} and deleted_at is not null) || '/'
  || (select count(*) from public.leads where project_id = ${project} and deleted_at is not null) || '/'
  || (select string_agg(status || ':' || (deleted_at is not null)::text, ',' order by id) from public.users where company_id = ${company}) || '/'
  || (select count(*) from public.client_removals where company_id = ${company})`);
const BEFORE = "0/0/0/active:false,disabled:false/1";

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });

  section("The client's page: Delete asks first");
  await admin.go(`/clients/${SLUG}`, 6000);
  await until(() => admin.pointer(`button[aria-label="Actions for ${NAME}"]`));
  await sleep(500);
  const items = await admin.ev(`[...document.querySelectorAll('[role=menuitem]')].map((e) => e.textContent.trim())`);
  check("a menu by Edit, with Delete", items.includes("Delete"), JSON.stringify(items));
  await admin.menuItem("Delete");
  const asked = await until(() => admin.ev(`[...document.querySelectorAll('[role=dialog]')].map((d) => d.innerText).find((t) => /Delete /.test(t)) ?? null`));
  check("it asks, by name, and says what goes with it: its 1 project, names, logins; nothing erased",
    new RegExp(`Delete ${NAME}\\?`).test(asked ?? "") && /its 1 project, their names and appointments/.test(asked ?? "") && /logins/.test(asked ?? "") && /Nothing is erased/.test(asked ?? ""), asked);
  check("nothing has happened yet", state() === BEFORE, state());

  section("Deleting it");
  await admin.click("[role=dialog] button", "Delete");
  check("the client, its project and names deleted; its people's logins disabled and hidden; its deletion list kept",
    Boolean(await until(() => state() === "1/1/2/disabled:true,disabled:true/1", { timeout: 8000 })), state());
  check("…back on Clients, where it is gone", Boolean(await until(async () => (await admin.path()) === "/clients", { timeout: 10000 }))
    && Boolean(await until(async () => !(await admin.ev(`document.body.innerText.includes(${JSON.stringify(NAME)})`)))), await admin.path());
  check("in the activity log, by name", sql(`select count(*) from public.activity_log where action = 'company.delete' and entity_id = ${company} and detail = ${lit(NAME)}`) === "1");

  section("Restored");
  await admin.go("/settings", 6000);
  await until(() => admin.ev(`!!document.querySelector('[data-deleted="companies:${company}"]')`));
  await admin.ev(`document.querySelector('[data-deleted="companies:${company}"]').scrollIntoView({ block: 'center' })`);
  await admin.click(`[data-deleted="companies:${company}"] [data-restore]`);
  await until(() => admin.ev(`!!document.querySelector('[data-confirm-dialog]')`));
  await admin.click("[data-confirm-dialog] [data-confirm]");
  check("all of it back, each login as it was (one active, one still disabled)", Boolean(await until(() => state() === BEFORE, { timeout: 8000 })), state());

  section("A manager");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await sean.go(`/clients/${SLUG}`, 5000);
  check("has no Delete for a client", !(await sean.ev(`!!document.querySelector('button[aria-label="Actions for ${NAME}"]')`)));
  sean.close();
} finally {
  browser.close();
  sql(`delete from public.activity_log where entity_id = ${company} and action in ('company.delete', 'record.restore')`);
  sql(`delete from public.client_removals where company_id = ${company}`);
  sql(`delete from public.users where company_id = ${company}`);
  sql(`delete from public.leads where project_id = ${project}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("delete client");
