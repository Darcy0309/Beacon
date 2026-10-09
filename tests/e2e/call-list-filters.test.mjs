/**
 * Filtering a call list, end to end (Sean, Oct 2026): an appointment
 * manager narrows their list for a project to the names renewing in a month
 * (or a window of the year), then by place, industry, carrier, who
 * developed it and so on, each included or excluded; Start calling begins
 * with a name that matches; the filter stays for the next visit; Clear all
 * brings every name back.
 *
 * Puts back everything it changed.
 *
 *   node tests/e2e/call-list-filters.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { signIn } from "../support/auth.mjs";

const MIKE = Number(sql("select id from public.users where email = 'mike@beacon.test'"));
// Mike's appointment project with the most names to call.
const PROJECT = Number(sql(`select l.project_id from public.leads l join public.call_results r on r.id = l.result_id
  join public.projects p on p.id = l.project_id join public.project_types t on t.id = p.project_type_id
  where l.assigned_user_id = ${MIKE} and r.viable and r.callable and t.code = 'APPT' group by 1 order by count(*) desc limit 1`));
const before = sql(`select coalesce(criteria::text, '') from public.call_list_filters where user_id = ${MIKE} and project_id = ${PROJECT}`);
sql(`delete from public.call_list_filters where user_id = ${MIKE} and project_id = ${PROJECT}`);
const mikeDb = await signIn("mike@beacon.test");
const totalNow = async () => Number((await mikeDb.sb.rpc("call_list", { p_project_id: PROJECT, p_limit: 1 })).data?.[0]?.total ?? 0);
const everyone = await totalNow();
// The month with the most names renewing, so the test has something to find.
const month = Number(sql(`select extract(month from d)::int from public.leads l join public.call_results r on r.id = l.result_id,
  unnest(public.lead_xdates(l.id)) d
  where l.project_id = ${PROJECT} and l.assigned_user_id = ${MIKE} and r.viable and r.callable
  group by 1 order by count(distinct l.id) desc limit 1`));
const renewsInMonth = (leadId) => sql(`select exists (select 1 from unnest(public.lead_xdates(${leadId})) d where extract(month from d) = ${month})`) === "t";

const browser = await launchBrowser();
try {
  const page = await (await browser.newContext({ as: "mike@beacon.test" })).newPage({ width: 1440, height: 1100 });
  const count = () => page.ev(`document.querySelector('[data-filter-count]')?.textContent ?? ''`);
  await page.go(`/work/${PROJECT}`, 4000);

  section("Narrowing the list to a renewal month");
  check("the filter sits over the list, with every name to start", Boolean(await until(async () => (await count()).includes(`${everyone} names, no filter`))), await count());
  await page.click(`[data-call-list-filters] [data-month="${month}"]`);
  await page.click("[data-apply-filters]");
  const inMonth = await until(async () => { const n = await totalNow(); return n && n < everyone ? n : null; });
  check("one click on a month and Apply: only names renewing that month, any year",
    Boolean(inMonth) && Boolean(await until(async () => (await count()).includes(`${inMonth} of ${everyone} names match`))), await count());
  const renewals = await page.ev(`[...document.querySelectorAll('tbody tr')].map((r) => r.children[5]?.innerText.trim()).filter(Boolean)`);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1];
  check("…the list shows them, each with the X-date that renews that month, and its line",
    renewals.length > 0 && renewals.every((r) => r.startsWith(mon) && /\n./.test(r)), JSON.stringify(renewals.slice(0, 5)));
  check("…the count says how many of all", /of \d+ match your filter/i.test(await page.text()));

  const first = await page.ev(`document.querySelector('a[href*="?project="]')?.getAttribute('href') ?? null`);
  await page.click("a", "Start calling");
  const leadId = await until(async () => (await page.path()).match(/^\/leads\/(\d+)/)?.[1]);
  check("Start calling opens the first matching name", Boolean(leadId) && renewsInMonth(leadId) && first?.includes(`/leads/${leadId}`),
    `${leadId} ${first}`);

  section("More criteria, included or excluded");
  await page.go(`/work/${PROJECT}`, 4000);
  check("the filter is still there on the next visit", (await count()).includes(`${inMonth} of ${everyone}`), await count());
  await page.click('[data-values="sic"]');
  await until(() => page.ev(`!!document.querySelector('[data-values-menu="sic"] [data-value]')`));
  const sic = await page.ev(`document.querySelector('[data-values-menu="sic"] [data-value]').dataset.value`);
  await page.click(`[data-values-menu="sic"] [data-value="${sic}"]`);
  await page.key("Escape");
  await page.click('[data-criterion="sic"] [role="group"] button', "Exclude");
  await page.click("[data-apply-filters]");
  const without = await until(async () => { const n = await totalNow(); return n !== inMonth ? n : null; });
  const expected = Number(sql(`select count(*) from public.leads l join public.call_results r on r.id = l.result_id
    where l.project_id = ${PROJECT} and l.assigned_user_id = ${MIKE} and r.viable and r.callable
      and exists (select 1 from unnest(public.lead_xdates(l.id)) d where extract(month from d) = ${month})
      and coalesce(btrim(l.sic_code), '') <> ${lit(sic)}`));
  check("an industry excluded: that month's names in any other industry", without === expected && Boolean(await until(async () => (await count()).includes(`${expected} of ${everyone}`))),
    `${without} vs ${expected}; ${await count()}`);
  check("…and the filter is spelled out, the exclusion as Not", /Renews .+ – /.test(await page.ev(`document.querySelector('[data-applied-filters]').innerText`))
    && /Not industry \(SIC\)/.test(await page.ev(`document.querySelector('[data-applied-filters]').innerText`)), await page.ev(`document.querySelector('[data-applied-filters]').innerText`));

  section("Clearing it");
  await page.click("[data-clear-filters]");
  check("Clear all: every name to call again", Boolean(await until(async () => (await totalNow()) === everyone && (await count()).includes(`${everyone} names, no filter`))), await count());
} finally {
  browser.close();
  sql(`delete from public.call_list_filters where user_id = ${MIKE} and project_id = ${PROJECT}`);
  if (before) sql(`insert into public.call_list_filters (user_id, project_id, criteria) values (${MIKE}, ${PROJECT}, ${lit(before)}::jsonb)`);
}

finish("call list filters");
