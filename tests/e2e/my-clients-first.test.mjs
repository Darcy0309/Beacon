/**
 * Clients and Projects start on the signed-in Sales Rep's own (Sean, Nov 2026: "I thought we changed the
 * default to the clients & projects for the sales rep/admin that's logged in, and sorted A to Z by client
 * name"). An administrator who owns clients sees theirs first, A to Z (Projects by client, then project);
 * All is a pick away and stays All; someone who owns none sees everyone, as before.
 *
 *   node tests/run.mjs tests/e2e/my-clients-first.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `MINE-TEST ${Date.now()}`;
const ADMIN = Number(sql("select id from public.users where email='admin@beacon.test'"));
const MIKE = Number(sql("select id from public.users where email='mike@beacon.test'"));
const typeId = (c) => sql(`select id from public.project_types where code=${lit(c)}`);
// The admin's clients, named out of order; Mike's, BTC Ins (as Sean's was).
const company = (name, rep) => Number(sql(`insert into public.companies (name, sales_rep_id, status) values (${lit(`${TAG} ${name}`)}, ${rep}, 'active') returning id`));
const ZEB = company("zebra Agency", ADMIN);
const ACME = company("Acme Insurance", ADMIN);
const BTC = company("BTC Ins", MIKE);
const project = (name, co) => Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} ${name}`)}, ${co}, ${typeId("APPT")}, 1) returning id`));
const PZ = project("Zeb Appts", ZEB);
const PA2 = project("Acme WI", ACME);
const PA1 = project("Acme AZ", ACME);
const PB = project("BTC Appts", BTC);
// Before: did the admin own any clients already (then the default shows those too, still theirs).
const ownedBefore = Number(sql(`select count(*) from public.companies where sales_rep_id = ${ADMIN} and name not like ${lit(`${TAG}%`)}`));

const browser = await launchBrowser();
const clientRows = (page) => page.ev(`[...document.querySelectorAll('[data-client-row]')].map((r) => Number(r.dataset.clientRow))`);
const projectRows = (page) => page.ev(`[...document.querySelectorAll('[data-project-link]')].map((a) => Number(a.getAttribute('href').split('/').pop()))`);
const ours = (ids, wanted) => ids.filter((id) => wanted.includes(id));
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });

  section("Clients: the Sales Rep's own, A to Z");
  await admin.go("/clients", 6000);
  await until(() => admin.ev("document.querySelectorAll('[data-client-row]').length > 0"), { timeout: 15000 });
  let rows = await clientRows(admin);
  check("only the admin's clients, not Mike's BTC Ins", rows.includes(ACME) && rows.includes(ZEB) && !rows.includes(BTC), JSON.stringify(ours(rows, [ACME, ZEB, BTC])));
  check("…A to Z, whatever the case (Acme before zebra)", JSON.stringify(ours(rows, [ACME, ZEB])) === JSON.stringify([ACME, ZEB]));
  const rep = await admin.ev(`document.querySelector('select[aria-label="Filter by Sales Rep"]')?.selectedOptions[0]?.textContent ?? ''`);
  check("…the Sales Rep filter says whose", rep && !/^All$/.test(rep), rep);
  check("…and the tiles say so too", /'s clients/.test(await admin.ev(`document.querySelector('[data-client-tiles]')?.innerText ?? ''`)));
  await admin.fill('select[aria-label="Filter by Sales Rep"]', "");
  await until(() => admin.ev("location.search.includes('rep=all')"), { timeout: 8000 });
  await sleep(800);
  rows = await clientRows(admin);
  check("All: everyone's, BTC Ins too", rows.includes(BTC) && rows.includes(ACME), JSON.stringify(ours(rows, [ACME, ZEB, BTC])));
  check("…A to Z", JSON.stringify(ours(rows, [ACME, BTC, ZEB])) === JSON.stringify([ACME, BTC, ZEB]), JSON.stringify(ours(rows, [ACME, BTC, ZEB])));
  await admin.go("/clients?rep=all", 5000);
  await until(() => admin.ev("document.querySelectorAll('[data-client-row]').length > 0"), { timeout: 15000 });
  check("…and stays All when opened again that way", (await clientRows(admin)).includes(BTC));

  section("Projects: the Sales Rep's clients' projects, by client then project");
  await admin.go(`/projects?q=${encodeURIComponent(TAG)}`, 6000);
  await until(() => admin.ev("document.querySelectorAll('[data-project-link]').length > 0"), { timeout: 15000 });
  let projects = await projectRows(admin);
  check("only the admin's clients' projects", JSON.stringify(projects) === JSON.stringify([PA1, PA2, PZ]), JSON.stringify(projects));
  check("…Acme's first (AZ, then WI), then zebra's", projects[0] === PA1 && projects[2] === PZ);
  await admin.fill('select[aria-label="Filter by Sales Rep"]', "");
  await until(() => admin.ev("location.search.includes('rep=all')"), { timeout: 8000 });
  await until(async () => (await projectRows(admin)).includes(PB), { timeout: 10000 });
  projects = await projectRows(admin);
  check("All: BTC Ins's too, in client order", JSON.stringify(projects) === JSON.stringify([PA1, PA2, PB, PZ]), JSON.stringify(projects));

  section("Someone who owns no clients: everyone's, as before");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 1000 });
  const seanOwns = Number(sql("select count(*) from public.companies where sales_rep_id = (select id from public.users where email='sean@beacon.test')"));
  if (seanOwns === 0) {
    await sean.go(`/projects?q=${encodeURIComponent(TAG)}`, 6000);
    await until(() => sean.ev("document.querySelectorAll('[data-project-link]').length > 0"), { timeout: 15000 });
    const seen = await projectRows(sean);
    check("a manager with no clients of their own: no Sales Rep picked for them", !(await sean.ev("location.search.includes('rep=')"))
      && (await sean.ev(`(document.querySelector('select[aria-label="Filter by Sales Rep"]')?.value ?? '') === ''`)), JSON.stringify(seen));
  } else {
    console.log("(sean owns clients here: the no-clients case is not checked)");
  }
  void ownedBefore;
} finally {
  browser.close();
  sql(`delete from public.projects where id in (${[PZ, PA1, PA2, PB].join(",")})`);
  sql(`delete from public.companies where id in (${[ZEB, ACME, BTC].join(",")})`);
}

finish("my clients first");
