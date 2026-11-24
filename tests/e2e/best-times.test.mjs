/**
 * The Production Heat Map (Sean and Darcy, Nov 2026; first Best Times to Call): calls by day and hour in the business's local time, each hour shaded
 * by how its calls turned into leads and appointments (one with too few calls greyed out); the best and worst hours;
 * filters; and a breakdown, here by state. A Wisconsin business called at 8 AM Central and an Arizona one at 8 AM
 * Arizona time are both 8 AM.
 *
 *   node tests/run.mjs tests/e2e/best-times.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `BT${Date.now()}`;
const SEAN = Number(sql(`select id from public.users where email = 'sean@beacon.test'`));
const result = (type, name) => sql(`select id from public.call_results where project_type = '${type}' and name = ${lit(name)}`);
const NONE = result("DBDV", "Viable-CallBack");
const LEAD = result("DBDV", "Lead");
const APPT = result("APPT", "Appointment");
// Last week's Tuesday, on the business's calendar.
const TUE = sql(`select (date_trunc('week', public.business_today()) - interval '6 days')::date::text`);
const co = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Capital Ins`)}) returning id`));
const P = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} DBDev`)}, ${co},
  (select id from public.project_types where code = 'DBDV'), 1) returning id`));
const lead = (state) => Number(sql(`insert into public.leads (company_name, project_id, state, sic_code) values (${lit(`${TAG} ${state} Co`)}, ${P}, '${state}', '4213') returning id`));
const WI = lead("WI");
const AZ = lead("AZ");
// `n` calls on a lead at a local hour of that Tuesday, `won` of them with result `res`.
const calls = (leadId, zone, hour, n, won, res) => sql(`insert into public.call_records (lead_id, project_id, user_id, call_date, call_result, result_id)
  select ${leadId}, ${P}, ${SEAN}, ((${lit(TUE)}::date + time '${String(hour).padStart(2, "0")}:15') at time zone '${zone}') + (i || ' seconds')::interval,
         case when i <= ${won} then 'Won' else 'Viable-CallBack' end, case when i <= ${won} then ${res} else ${NONE} end
    from generate_series(1, ${n}) i`);
calls(WI, "America/Chicago", 8, 15, 3, LEAD);
calls(AZ, "America/Phoenix", 8, 10, 2, APPT);
calls(WI, "America/Chicago", 12, 25, 0, LEAD);
calls(WI, "America/Chicago", 15, 5, 5, LEAD);
// Another project of the client's, that Sean isn't on: 30 calls at 9 AM.
const P2 = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Other`)}, ${co},
  (select id from public.project_types where code = 'DBDV'), 1) returning id`));
const OTHER = Number(sql(`insert into public.leads (company_name, project_id, state, sic_code) values (${lit(`${TAG} Other Co`)}, ${P2}, 'WI', '4213') returning id`));
sql(`insert into public.call_records (lead_id, project_id, user_id, call_date, call_result, result_id)
  select ${OTHER}, ${P2}, ${SEAN}, ((${lit(TUE)}::date + time '09:15') at time zone 'America/Chicago') + (i || ' seconds')::interval, 'x', ${NONE} from generate_series(1, 30) i`);
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${P}, ${SEAN})`);

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await admin.go(`/reports/heat-map?client=${co}&by=state`, 8000);
  const cell = (key) => admin.ev(`(() => { const c = document.querySelector('[data-best-cell="${key}"]'); return c ? { text: c.textContent.trim(), thin: c.hasAttribute('data-thin') } : null; })()`);

  section("By day and hour, in the business's local time");
  const eight = await until(() => cell("2-8").then((c) => (c?.text ? c : null)), { timeout: 20000 });
  check("Tuesday 8 AM: the Wisconsin and Arizona calls together (25), 5 won: 20%", eight?.text === "20.0%" && !eight.thin, JSON.stringify(eight));
  check("Tuesday noon: 25 calls, none won: 0%", (await cell("2-12"))?.text === "0.0%");
  check("Tuesday 3 PM: 5 calls, too few to judge, greyed out", (await cell("2-15"))?.thin === true);
  check("…the totals (the other project's 30 calls too, for an administrator)", /85 calls · 8 leads · 2 appointments/.test(await admin.ev(`document.querySelector('[data-best-total]')?.textContent ?? ''`)));

  section("Leads, appointments");
  await admin.click('[data-best-mode="appts"]');
  check("Appointments only: Tuesday 8 AM 8%", (await until(() => cell("2-8").then((c) => (c?.text === "8.0%" ? c : null))))?.text === "8.0%");
  await admin.click('[data-best-mode="both"]');

  section("Best and worst hours");
  const best = await admin.ev(`document.querySelector('[data-best-windows] li')?.innerText.replace(/\\s+/g, ' ')`);
  check("best: Tuesday 8–9 AM", /Tue 8–9 AM/.test(best ?? "") && /20\.0%/.test(best), best);
  const worst = await admin.ev(`document.querySelector('[data-worst-windows] li')?.innerText.replace(/\\s+/g, ' ')`);
  check("worst: Tuesday 12–1 PM", /Tue 12–1 PM/.test(worst ?? ""), worst);

  section("Broken down by state");
  const groups = await admin.ev(`[...document.querySelectorAll('[data-best-group]')].map((r) => r.dataset.bestGroup)`);
  check("Wisconsin and Arizona, each its own", groups.includes("WI") && groups.includes("AZ"), JSON.stringify(groups));

  section("Filtered");
  await admin.go(`/reports/heat-map?client=${co}&state=AZ`, 6000);
  check("Arizona only: 10 calls at 8 AM, too few to judge", (await until(() => cell("2-8").then((c) => (c ? c : null))))?.thin === true);
  await admin.go(`/reports/heat-map?client=${co}&sic=42`, 6000);
  check("an industry's first digits (42, trucking): all of them", /85 calls/.test(await until(() => admin.ev(`document.querySelector('[data-best-total]')?.textContent ?? null`))));

  section("Its name, and its old address");
  check("called the Production Heat Map", /Production Heat Map/.test(await admin.ev(`document.querySelector('header')?.innerText ?? document.title`)));
  await admin.go(`/reports/best-times?client=${co}`, 6000);
  check("the old address goes to it, filters kept", Boolean(await until(async () => (await admin.url()).startsWith(`/reports/heat-map?client=${co}`))), await admin.url());
  check("…an administrator sees every project of the client's (the other one's 30 calls too)", /85 calls/.test(await until(() => admin.ev(`document.querySelector('[data-best-total]')?.textContent ?? null`))));

  section("Early Starts");
  const early = () => admin.ev(`(() => { const r = document.querySelector('[data-early-row="${SEAN}"]'); return r ? { first: r.querySelector('[data-first-call]').textContent, early: r.querySelector('[data-early-rate]').textContent, later: r.querySelector('[data-later-rate]').textContent, lead: r.querySelector('[data-to-lead]').innerText.replace(/\\s+/g, ' '), slow: !!r.querySelector('[data-slow-start]'), text: r.innerText.replace(/\\s+/g, ' ') } : null; })()`);
  const es = await until(early, { timeout: 15000 });
  check("Sean's first call, on average: 8:15 AM in the business's local time", es?.first === "8:15 AM", JSON.stringify(es));
  check("…25 calls before 9 (Wisconsin's and Arizona's), 3 leads and 2 appointments: 20%", /\b25\b/.test(es?.text ?? "") && /3 · 2/.test(es.text) && es.early === "20.0%", JSON.stringify(es));
  check("…after 9: 60 calls, 5 leads: 8.3%; not a slow start", es?.later === "8.3%" && !es.slow, JSON.stringify(es));
  check("…his first lead with his first call", /^0m on 1 day with a lead/.test(es?.lead ?? ""), es?.lead);

  section("A manager: the projects they're assigned to");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await sean.go(`/reports/heat-map?client=${co}`, 8000);
  const mine = await until(() => sean.ev(`document.querySelector('[data-best-total]')?.textContent ?? null`), { timeout: 20000 });
  check("Sean sees his project's calls, not the one he isn't on", /55 calls/.test(mine ?? ""), mine);
  const own = await until(() => sean.ev(`[...document.querySelectorAll('[data-early-row]')].map((r) => [r.dataset.earlyRow, r.querySelector('[data-later-rate]').textContent])`).then((x) => (x?.length ? x : null)));
  check("…Early Starts: only his own row, on his own project (after 9: 30 calls, 5 leads)", JSON.stringify(own) === JSON.stringify([[String(SEAN), "16.7%"]]), JSON.stringify(own));
  check("…in the menu", Boolean(await until(() => sean.ev(`[...document.querySelectorAll('a, [role=link]')].some((a) => a.textContent.trim() === 'Production Heat Map')`))));
  const agentPage = await (await browser.newContext({ as: "agent@beacon.test" })).newPage({ width: 1200, height: 900 });
  await agentPage.go("/reports/heat-map", 5000);
  check("not for an agent", !(await agentPage.ev(`!!document.querySelector('[data-best-times]')`)));
} finally {
  browser.close();
  sql(`delete from public.project_assignments where project_id in (${P}, ${P2})`);
  sql(`delete from public.call_records where project_id in (${P}, ${P2})`);
  sql(`delete from public.leads where project_id in (${P}, ${P2})`);
  sql(`delete from public.projects where id in (${P}, ${P2})`);
  sql(`delete from public.companies where id = ${co}`);
}

finish("best times");
