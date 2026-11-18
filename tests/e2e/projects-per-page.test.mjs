/**
 * All Projects (Sean, Nov 2026): every project of the clients picked on one list, filtered where it is
 * shown. Status, Type and the search change the list and nothing else: no reload, the tiles as they
 * were (before, each reloaded the whole page). A Client, Agency group or Sales Rep goes to the address,
 * as the tiles follow it. Other lists still 10 to a page.
 *
 *   node tests/run.mjs tests/e2e/projects-per-page.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `PPP-TEST ${Date.now()}`;
const typeId = (c) => sql(`select id from public.project_types where code=${lit(c)}`);
const statusId = (n) => sql(`select id from public.project_statuses where name=${lit(n)}`);
const co = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Agency`)}) returning id`));
const PAUSED = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Paused Appts`)}, ${co}, ${typeId("APPT")}, ${statusId("Paused")}) returning id`));
const ACTIVE = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Active DBDev`)}, ${co}, ${typeId("DBDV")}, ${statusId("Active")}) returning id`));
const projects = Number(sql("select count(*) from public.projects where deleted_at is null"));
const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 1000 });
  const per = () => admin.ev(`document.querySelector('select[aria-label="Rows per page"]')?.value ?? null`);
  const shown = () => admin.ev(`[...document.querySelectorAll('[data-project-link]')].map((a) => Number(a.getAttribute('href').split('/').pop()))`);
  const chip = (group, label) => admin.ev(`(() => { const g = [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === ${JSON.stringify(label)});
    const b = g.find((x) => x.closest('div')?.textContent.includes(${JSON.stringify(group)})) ?? g[0]; b?.click(); return Boolean(b); })()`);

  section("All Projects: every one, filtered where it is");
  await admin.go("/projects?rep=all", 6000);
  await until(() => admin.ev("document.querySelectorAll('[data-project-link]').length > 0"), { timeout: 15000 });
  check(`every project on one list (${projects})`, (await shown()).length === projects, `${(await shown()).length} of ${projects}`);
  check("…no rows-per-page", (await per()) === null);
  const tiles = await admin.ev("document.querySelector('.expand-row')?.innerText ?? ''");
  await admin.ev("window.__notReloaded = true");
  const at = await admin.url();

  check("Status: Paused chosen", await chip("Status", "Paused"));
  await sleep(500);
  let ids = await shown();
  check("…only paused projects listed", ids.includes(PAUSED) && !ids.includes(ACTIVE), JSON.stringify(ids.filter((i) => [PAUSED, ACTIVE].includes(i))));
  check("…the page not reloaded, the address and tiles as they were", (await admin.ev("window.__notReloaded === true")) && (await admin.url()) === at
    && (await admin.ev("!document.querySelector('[data-page-loader]')")) && (await admin.ev("document.querySelector('.expand-row')?.innerText ?? ''")) === tiles);
  await chip("Status", "All");
  check("Type: DBDV chosen", await chip("Type", "DBDV"));
  await sleep(500);
  ids = await shown();
  check("…only DB dev projects", ids.includes(ACTIVE) && !ids.includes(PAUSED));
  await chip("Type", "All");
  await admin.fill('input[placeholder="Search projects…"]', `${TAG} paused`);
  await sleep(500);
  check("the search: only what matches, still not reloaded", JSON.stringify(await shown()) === JSON.stringify([PAUSED]) && (await admin.ev("window.__notReloaded === true")), JSON.stringify(await shown()));

  section("A Sales Rep: in the address, the tiles follow");
  await admin.fill('input[placeholder="Search projects…"]', "");
  const rep = await admin.ev(`[...document.querySelector('select[aria-label="Filter by Sales Rep"]').options].find((o) => o.value)?.value`);
  await admin.fill('select[aria-label="Filter by Sales Rep"]', rep);
  check("…the address says whose", Boolean(await until(async () => (await admin.url()).includes(`rep=${rep}`), { timeout: 10000 })), await admin.url());
  check("…and the tiles say so", Boolean(await until(async () => /'s clients/.test(await admin.ev("document.querySelector('.expand-row')?.innerText ?? ''")), { timeout: 15000 })));

  section("Another list");
  await admin.go("/leads", 6000);
  check("the Leads list: still 10 to a page to begin with", (await until(per, { timeout: 15000 })) === "10", await per());
} finally {
  browser.close();
  sql(`delete from public.projects where id in (${PAUSED}, ${ACTIVE})`);
  sql(`delete from public.companies where id = ${co}`);
}
finish("projects per page");
