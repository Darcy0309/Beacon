/**
 * Search in the app: the Ctrl+K palette offers only what the role can open,
 * counts each group and says whose a lead is; the lists find what was typed
 * word by word ("Sean Fitzgerald", "Drain, LLC", a project by its client's
 * name, a phone however it is written); the users list's two-factor filter
 * counts every account, not the page; and the Lead Explorer shows every
 * renewal month and an honest export.
 *
 *   npm run test:e2e      (SHOTS=<dir> to keep screenshots)
 */
import { APP_URL } from "../support/env.mjs";
import { check, finish, section, until } from "../support/assert.mjs";
import { sessionCookies, cookieHeader } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const SHOTS = process.env.SHOTS;
// One word, so a search can include it to stay inside this test's own rows.
const TAG = `srche${Date.now()}`;
const PHONE_AREA = String(200 + (Date.now() % 700));

const companyId = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance Group`)}) returning id`));
const projectId = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} Plumbers Campaign`)}, ${companyId}, (select id from public.project_types where code='DBDV'), 1) returning id`));
const newLead = (name, phone = null) => Number(sql(`insert into public.leads (company_name, project_id, status_id, phone)
  values (${lit(`${TAG} ${name}`)}, ${projectId}, (select id from public.lead_statuses where code='new'), ${phone ? lit(phone) : "null"}) returning id`));
newLead("AZ Pro Plumbing and Drain, LLC", `(${PHONE_AREA}) 851-8511`);
for (let i = 0; i < 7; i++) newLead(`Filler ${i} Plumbing`);

const cookies = {};
const get = async (path, as = "admin@beacon.test") => {
  cookies[as] ??= cookieHeader(await sessionCookies(as));
  const res = await fetch(`${APP_URL}${path}`, { headers: { cookie: cookies[as] } });
  return res.text();
};
const totalOf = (html) => Number(html.match(/\d+–\d+ of (\d+)/)?.[1] ?? (/No \w+/.test(html) ? 0 : NaN));

const browser = await launchBrowser();
const shot = (page, name) => (SHOTS ? page.screenshot(`${SHOTS}/${name}.png`) : null);

/** Open the palette on `page` and type `q`; resolves once results (or "No matches") show. */
async function palette(page, q) {
  // Either opener (the topbar box is hidden on narrow screens, the icon on wide ones);
  // retried, since a press before hydration does nothing.
  const isOpen = () => page.ev("Boolean(document.querySelector('input[aria-label=\"Search everything\"]'))");
  if (!(await isOpen())) {
    await until(async () => {
      await page.ev(`[...document.querySelectorAll('button[aria-label^="Search"]')].find((b) => b.offsetParent)?.click()`);
      return isOpen();
    }, { timeout: 10000, interval: 500 });
  }
  if (q == null) return;
  // Cleared first, so the results waited for are this search's, not the last one's.
  await page.fill('input[aria-label="Search everything"]', "");
  await until(() => page.ev("!document.querySelector('[data-search-group]')"));
  await page.fill('input[aria-label="Search everything"]', q);
  await until(() => page.ev("Boolean(document.querySelector('[data-search-group]')) || /No matches/.test(document.getElementById('global-search-results')?.innerText ?? '')"), { timeout: 8000 });
}
const kinds = (page) => page.ev("[...document.querySelectorAll('[data-search-kind]')].map((e) => e.dataset.searchKind)");
const groupsShown = (page) => page.ev("[...document.querySelectorAll('[data-search-group]')].map((e) => e.dataset.searchGroup)");
const groupCount = (page, key) => page.ev(`document.querySelector('[data-search-group="${key}"] [data-group-count]')?.textContent ?? null`);
const options = (page) => page.ev("[...document.querySelectorAll('#global-search-results [role=option]')].map((o) => o.innerText.replace(/\\s+/g, ' '))");

try {
  section("Ctrl+K as an administrator");
  {
    const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage();
    await admin.go("/", 4000);
    await palette(admin);
    check("before typing, it lists every kind an administrator can open",
      JSON.stringify(await kinds(admin)) === JSON.stringify(["leads", "clients", "projects", "users", "documents", "carriers"]), JSON.stringify(await kinds(admin)));
    await palette(admin, `${TAG} plumbing`);
    check("the leads group counts every match", (await until(() => groupCount(admin, "leads"))) === "5 of 8", await groupCount(admin, "leads"));
    await shot(admin, "search-admin");

    await palette(admin, `${TAG} Drain, LLC`);
    const lines = await options(admin);
    check("a comma in the name still matches", lines.some((l) => l.includes("Drain, LLC")), JSON.stringify(lines));
    check("a lead says whose it is and its status", lines.some((l) => l.includes("Drain, LLC") && l.includes(`${TAG} Insurance Group`) && l.includes("New")), JSON.stringify(lines));
    await palette(admin, `${TAG} ${PHONE_AREA}.851.8511`);
    check("a phone typed with dots", (await options(admin)).some((l) => l.includes("Drain, LLC")), JSON.stringify(await options(admin)));
    await palette(admin, `${TAG} insurance`);
    check("a project by its client's name", (await groupsShown(admin)).includes("projects") && (await options(admin)).some((l) => l.includes("Plumbers Campaign")));
    await palette(admin, "Sean Fitzgerald");
    check("a person by first and last name", (await groupsShown(admin)).includes("users") && (await options(admin)).some((l) => l.includes("Sean Fitzgerald")), JSON.stringify(await options(admin)));
    await admin.key("Enter");
    check("Enter opens the first result", await until(async () => (await admin.path()) === "/users"), await admin.url());
    admin.close();
  }

  section("Ctrl+K as an agent: only what an agent can open");
  {
    const agent = await (await browser.newContext({ as: "agent@beacon.test" })).newPage();
    await agent.go("/", 4000);
    await palette(agent);
    check("the kinds offered are leads and documents", JSON.stringify(await kinds(agent)) === JSON.stringify(["leads", "documents"]), JSON.stringify(await kinds(agent)));
    await palette(agent, "Sean Fitzgerald");
    const shown = await groupsShown(agent);
    check("no users group, even for a name that exists", !shown.includes("users"), JSON.stringify(shown));
    await palette(agent, `${TAG} insurance`);
    check("no projects or clients group either", !(await groupsShown(agent)).some((g) => g === "projects" || g === "clients"), JSON.stringify(await groupsShown(agent)));
    agent.close();
  }

  section("The lists search every word");
  {
    const users = await get(`/users?q=${encodeURIComponent("Sean Fitzgerald")}`);
    check("users: “Sean Fitzgerald” finds him", users.includes("sean@beacon.test") && totalOf(users) === 1, String(totalOf(users)));
    const leads = await get(`/leads?q=${encodeURIComponent(`${TAG} Drain, LLC`)}`);
    check("leads: “Drain, LLC” finds the company", leads.includes("Drain, LLC") && totalOf(leads) === 1, String(totalOf(leads)));
    const phone = await get(`/leads?q=${encodeURIComponent(`${PHONE_AREA}-851-8511`)}`);
    check("leads: a phone written with dashes", phone.includes("Drain, LLC"));
    const projects = await get(`/projects?q=${encodeURIComponent(`${TAG} insurance group`)}`);
    check("projects: found by the client's name", projects.includes(`${TAG} Plumbers Campaign`) && totalOf(projects) === 1, String(totalOf(projects)));
  }

  section("Users: the two-factor filter counts every account");
  {
    const all = Number(sql("select count(*) from public.users"));
    const on = Number(sql("select count(*) from public.users u where exists (select 1 from auth.mfa_factors f where f.user_id = u.auth_id and f.status = 'verified')"));
    const onHtml = await get("/users?mfa=true");
    const offHtml = await get("/users?mfa=false");
    check("Two-Factor: On counts every account with it", totalOf(onHtml) === on, `${totalOf(onHtml)} vs ${on}`);
    check("Two-Factor: Off counts every account without it", totalOf(offHtml) === all - on, `${totalOf(offHtml)} vs ${all - on}`);
  }

  section("Lead Explorer: every renewal month, an honest export");
  {
    const months = Number(sql(`select count(distinct extract(month from public.lead_renewal_date(l.id))) from public.leads l where public.lead_renewal_date(l.id) is not null`));
    const page = await (await browser.newContext({ as: "admin@beacon.test" })).newPage();
    await page.go("/explore", 5000);
    const shownMonths = await page.ev(`document.querySelector('[data-breakdown="By Renewal Month"]')?.querySelectorAll('[data-list-row]').length ?? 0`);
    check("the renewal-month panel shows every month with leads", shownMonths === months, `${shownMonths} vs ${months}`);
    const total = Number(sql("select count(*) from public.leads"));
    const capNote = await page.ev("document.querySelector('[data-export-cap]')?.textContent ?? ''");
    check("the export says when it would be cut short", total > 10000 ? /first 10,000/.test(capNote) : capNote === "", `${total} leads; "${capNote}"`);
    const download = await page.ev("(() => { const a = [...document.querySelectorAll('a')].find((e) => e.textContent.includes('Export CSV')); return a ? { download: a.hasAttribute('download'), href: a.getAttribute('href') } : null; })()");
    check("Export CSV is a plain download link", download?.download === true && download.href.startsWith("/api/explore/export"), JSON.stringify(download));
    const res = await fetch(`${APP_URL}/api/explore/export?months=9`, { headers: { cookie: cookies["admin@beacon.test"] ?? cookieHeader(await sessionCookies("admin@beacon.test")) } });
    const csv = await res.text();
    check("the CSV has the renewal date column", csv.split("\r\n")[0].includes("Renewal Date"), csv.split("\r\n")[0]);
    const sept = Number(sql("select count(*) from public.leads l where extract(month from public.lead_renewal_date(l.id)) = 9"));
    check("September in the CSV counts every policy line, like the page", Number(res.headers.get("x-total-count")) === sept, `${res.headers.get("x-total-count")} vs ${sept}`);
    check("not marked cut short when it is whole", res.headers.get("x-truncated") === (sept > 10000 ? "true" : null), String(res.headers.get("x-truncated")));
    await shot(page, "explore");
    page.close();
  }
} finally {
  browser.close();
  sql(`delete from public.leads where company_name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.projects where name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.companies where name like ${lit(`${TAG}%`)}`);
}

finish("search");
