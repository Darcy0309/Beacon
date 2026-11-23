/**
 * Best Times to Call (Sean and Darcy, Nov 2026): calls by day and hour in the business's local time, each hour shaded
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

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await admin.go(`/reports/best-times?client=${co}&by=state`, 8000);
  const cell = (key) => admin.ev(`(() => { const c = document.querySelector('[data-best-cell="${key}"]'); return c ? { text: c.textContent.trim(), thin: c.hasAttribute('data-thin') } : null; })()`);

  section("By day and hour, in the business's local time");
  const eight = await until(() => cell("2-8").then((c) => (c?.text ? c : null)), { timeout: 20000 });
  check("Tuesday 8 AM: the Wisconsin and Arizona calls together (25), 5 won: 20%", eight?.text === "20.0%" && !eight.thin, JSON.stringify(eight));
  check("Tuesday noon: 25 calls, none won: 0%", (await cell("2-12"))?.text === "0.0%");
  check("Tuesday 3 PM: 5 calls, too few to judge, greyed out", (await cell("2-15"))?.thin === true);
  check("…the totals", /55 calls · 8 leads · 2 appointments/.test(await admin.ev(`document.querySelector('[data-best-total]')?.textContent ?? ''`)));

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
  await admin.go(`/reports/best-times?client=${co}&state=AZ`, 6000);
  check("Arizona only: 10 calls at 8 AM, too few to judge", (await until(() => cell("2-8").then((c) => (c ? c : null))))?.thin === true);
  await admin.go(`/reports/best-times?client=${co}&sic=42`, 6000);
  check("an industry's first digits (42, trucking): all of them", /55 calls/.test(await until(() => admin.ev(`document.querySelector('[data-best-total]')?.textContent ?? null`))));

  section("Administrators only");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1200, height: 900 });
  await sean.go("/reports/best-times", 5000);
  check("not for a manager", !(await sean.ev(`!!document.querySelector('[data-best-times]')`)));
} finally {
  browser.close();
  sql(`delete from public.call_records where project_id = ${P}`);
  sql(`delete from public.leads where project_id = ${P}`);
  sql(`delete from public.projects where id = ${P}`);
  sql(`delete from public.companies where id = ${co}`);
}

finish("best times");
