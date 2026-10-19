/**
 * A page on its way (Sean, Oct 2026), on a slow connection (each request
 * held back): the bar along the top of the window runs from the click until
 * the page shows, and a page opened from its list (a lead, a report) shows
 * the loader — the Signature sphere with its lights running around it —
 * rather than the list staying put. A list's own filter, search or page size
 * runs the bar but keeps the list on screen, never the loader.
 *
 *   npm run test:e2e
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `PL-TEST ${Date.now()}`;
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const typeId = (c) => sql(`select id from public.project_types where code=${lit(c)}`);
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Agency`)}) returning id`));
const P = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Churches`)}, ${company}, ${typeId("DBDV")}, 1) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${P}, ${SEAN})`);
sql(`insert into public.leads (company_name, contact_name, phone, city, state, project_id, assigned_user_id)
  select ${lit(TAG)} || ' Church ' || g, 'Pat ' || g, '715-555-' || lpad(g::text, 4, '0'), 'Eau Claire', 'WI', ${P}, ${SEAN} from generate_series(1, 30) g`);
const LEAD = Number(sql(`select id from public.leads where project_id = ${P} order by id limit 1`));

const browser = await launchBrowser();

/** Watch the page from here: did the loader show, did the bar run, and is it all over now. */
const watch = (page) => page.ev(`(() => {
  window.__seen = { loader: false, bar: false, orbits: 0, sphere: false, text: "" };
  const look = () => {
    const l = document.querySelector('[data-page-loader]');
    if (l && !window.__seen.loader) Object.assign(window.__seen, {
      loader: true, orbits: l.querySelectorAll('.page-loader-orbit').length,
      sphere: !!l.querySelector('.page-loader-sphere path'), text: l.querySelector('[role=status]')?.textContent ?? "",
    });
    if (document.querySelector('[data-nav-progress="loading"]')) window.__seen.bar = true;
  };
  window.__watch?.disconnect();
  window.__watch = new MutationObserver(look);
  window.__watch.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-nav-progress', 'class'] });
  return true;
})()`);
const seen = (page) => page.ev("window.__seen");
const settled = (page) => until(() => page.ev(`!document.querySelector('[data-page-loader]') && document.querySelector('[data-nav-progress]')?.dataset.navProgress === 'idle'`), { timeout: 15000 });
const slow = (page, ms) => page.send("Network.emulateNetworkConditions", { offline: false, latency: ms, downloadThroughput: -1, uploadThroughput: -1 });

try {
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 950 });
  await sean.send("Network.enable");

  section("A lead opened from the call list");
  await sean.go(`/work/${P}`, 4000);
  await slow(sean, 700);
  await watch(sean);
  check("the call list links the lead", await sean.ev(`(() => { const a = document.querySelector('tbody a[href^="/leads/${LEAD}?"]'); if (!a) return false; a.click(); return true; })()`));
  await until(async () => (await seen(sean))?.loader, { timeout: 8000 });
  const shown = await seen(sean);
  check("the loader shows while the lead is on its way: the sphere, its two lights, Loading", shown?.loader && shown.sphere && shown.orbits === 2 && /Loading/.test(shown.text), JSON.stringify(shown));
  check("…the lead's page replaces it", Boolean(await settled(sean)) && (await sean.path()) === `/leads/${LEAD}`
    && (await sean.text()).includes(`${TAG} Church 1`), await sean.path());
  check("…and the bar along the top ran, then went", (await seen(sean))?.bar === true, JSON.stringify(await seen(sean)));

  if (process.env.SHOTS) {
    // A slow download: the loader stays up while the page trickles in, long enough to see.
    await sean.go(`/work/${P}`, 4000);
    await sean.send("Network.emulateNetworkConditions", { offline: false, latency: 300, downloadThroughput: 6 * 1024, uploadThroughput: -1 });
    await sean.ev(`document.querySelector('tbody a[href^="/leads/"]')?.click()`);
    await until(() => sean.ev(`!!document.querySelector('[data-page-loader]')`), { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 900));
    await sean.screenshot(`${process.env.SHOTS}/page-loader.png`);
    await slow(sean, 0);
    await settled(sean);
  }

  section("A list's own filters keep the list on screen");
  await slow(sean, 0);
  await sean.go(`/work/${P}`, 4000);
  await slow(sean, 700);
  await watch(sean);
  await sean.fill('select[aria-label="Rows per page"]', "20");
  check("rows per page: the bar runs", Boolean(await until(async () => (await seen(sean))?.bar, { timeout: 5000 })));
  await settled(sean);
  check("…the call list stays, no loader", (await seen(sean))?.loader === false && (await sean.url()).includes("per=20"), JSON.stringify([await seen(sean), await sean.url()]));
  await watch(sean);
  check("…its search box", await sean.fill('input[aria-label="Find a name on this list…"]', "Church 2"));
  await until(async () => (await sean.url()).includes("q="), { timeout: 8000 });
  await settled(sean);
  check("searching it: the bar runs, no loader either", (await seen(sean))?.loader === false && (await seen(sean))?.bar === true && (await sean.url()).includes("q="),
    JSON.stringify([await seen(sean), await sean.url()]));

  section("A report opened from Reports");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 950 });
  await admin.send("Network.enable");
  await admin.go("/reports", 4000);
  await slow(admin, 700);
  await watch(admin);
  const opened = await admin.ev(`(() => { const a = document.querySelector('a[href^="/reports/"]'); if (!a) return null; a.click(); return a.getAttribute('href'); })()`);
  await until(async () => (await seen(admin))?.loader, { timeout: 8000 });
  await settled(admin);
  check("the loader shows, then the report", (await seen(admin))?.loader === true && (await admin.path()) === opened?.split("?")[0], JSON.stringify([opened, await seen(admin)]));

  section("Back to the list");
  await watch(admin);
  await admin.ev("history.back()");
  await settled(admin);
  check("back lands on Reports, nothing left loading", (await admin.path()) === "/reports" && !(await admin.ev(`document.documentElement.hasAttribute('data-navigating')`)));
} finally {
  browser.close();
  sql(`delete from public.activity_log where entity='lead' and entity_id in (select id from public.leads where project_id = ${P})`);
  sql(`delete from public.leads where project_id = ${P}`);
  sql(`delete from public.project_assignments where project_id = ${P}`);
  sql(`delete from public.activity_log where entity='project' and entity_id = ${P}`);
  sql(`delete from public.projects where id = ${P}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("page loading");
