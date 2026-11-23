/**
 * Project Info: a carrier not on the Insurance Cos. list added from the sheet itself (Sean, Nov 2026: "If it doesn't
 * recognize the carrier I'm trying to find, it will have a button to 'Add Carrier' and it will update the master
 * list"). Found nowhere: Add it, and it is on the list and picked; one already on file however it is written is that
 * one, not a second; saved with the sheet. Administrators only.
 *
 *   node tests/run.mjs tests/e2e/project-info-add-carrier.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `PIC${Date.now()}`;
const NEW = `${TAG} Zeta Mutual`;
const KNOWN = `${TAG} Acme Casualty Co.`;
sql(`insert into public.agencies (name) values (${lit(KNOWN)})`);
const co = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Capital Ins`)}) returning id`));
const P = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts`)}, ${co},
  (select id from public.project_types where code = 'APPT'), 1) returning id`));
const clientCompany = sql(`select coalesce(company_id::text, 'null') from public.users where email = 'client@beacon.test'`);
const onList = (name) => sql(`select count(*) from public.agencies where name = ${lit(name)}`);
const top = '[data-dialog-content] [data-pick-list="top_carriers"]';
const chips = (page) => page.ev(`[...document.querySelectorAll('${top} [data-picked]')].map((c) => c.dataset.picked)`);

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await admin.go(`/projects/${P}`, 7000);
  await until(() => admin.ev(`!!document.querySelector('[data-project-info-card] [data-edit-project-info]')`), { timeout: 20000 });
  await admin.click("[data-project-info-card] [data-edit-project-info]");
  await until(() => admin.ev(`!!document.querySelector('${top} [data-pick-open]')`));
  await admin.click(`${top} [data-pick-open]`);

  section("A carrier not on the list");
  await admin.fill(`${top} [data-pick-find]`, NEW);
  const offer = await until(() => admin.ev(`document.querySelector('${top} [data-pick-add-new]')?.textContent.trim() ?? null`));
  check("found nowhere: Add it as a carrier", offer === `Add “${NEW}” as a carrier`, offer);
  await admin.click(`${top} [data-pick-add-new]`);
  check("added to the Insurance Cos. list", Boolean(await until(() => onList(NEW) === "1")));
  check("…and picked", Boolean(await until(async () => (await chips(admin))?.includes(NEW))), JSON.stringify(await chips(admin)));
  check("…said so", /added to the Insurance Cos\. list/.test((await admin.waitToast(/Insurance Cos/, 6000)) ?? ""));

  section("One already on file, written another way");
  await admin.fill(`${top} [data-pick-find]`, `${TAG} acme casualty co`);
  await until(() => admin.ev(`!!document.querySelector('${top} [data-pick-add-new]')`));
  await admin.click(`${top} [data-pick-add-new]`);
  check("the one on file is picked, not a second", Boolean(await until(async () => (await chips(admin))?.includes(KNOWN))) && sql(`select count(*) from public.agencies where name ilike ${lit(`${TAG} acme%`)}`) === "1",
    JSON.stringify(await chips(admin)));

  section("Saved with the sheet");
  await admin.click("[data-dialog-content] button[type=submit]");
  const saved = await until(() => sql(`select array_to_string(top_carriers, '|') from public.project_profiles where project_id = ${P}`) || null, { timeout: 15000 });
  check("its top carriers, the new one too", saved === `${NEW}|${KNOWN}`, saved);

  section("Not for a client");
  sql(`update public.users set company_id = ${co} where email = 'client@beacon.test'`);
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1400, height: 1000 });
  await client.go("/project-info", 7000);
  await until(() => client.ev(`!!document.querySelector('[data-edit-project-info]')`), { timeout: 20000 });
  await client.click("[data-edit-project-info]");
  await until(() => client.ev(`!!document.querySelector('[data-pick-list="top_carriers"] [data-pick-open]')`));
  await client.click('[data-pick-list="top_carriers"] [data-pick-open]');
  await sleep(300);
  await client.fill('[data-pick-list="top_carriers"] [data-pick-find]', "Nowhere Mutual");
  await sleep(500);
  check("no Add for a client", !(await client.ev(`!!document.querySelector('[data-pick-add-new]')`)));
} finally {
  browser.close();
  sql(`update public.users set company_id = ${clientCompany} where email = 'client@beacon.test'`);
  sql(`delete from public.project_profiles where project_id = ${P}`);
  sql(`delete from public.projects where id = ${P}`);
  sql(`delete from public.companies where id = ${co}`);
  sql(`delete from public.agencies where name like ${lit(`${TAG}%`)}`);
}

finish("project info add carrier");
