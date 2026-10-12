/**
 * The administrator's production chart (Sean, Oct 2026), end to end: in
 * place of Lead Volume, the leads and appointments the team developed —
 * today by the hour from 5 AM to 6 PM to begin with, then 5D … YTD and More,
 * both lines or one; narrowed to a manager; under it the high, low,
 * average, per hour worked and % of the month's goal, the goals set in a
 * dialog that works them out from the team.
 *
 * Puts back everything it changed.
 *
 *   node tests/e2e/production-chart.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `PCH-E2E ${Date.now()}`;
const SEAN = Number(sql("select id from public.users where email = 'sean@beacon.test'"));
const tz = sql("select public.business_tz()");
const today = sql("select ((now() at time zone public.business_tz())::date)::text");
const month = `${today.slice(0, 8)}01`;
const local = (hour) => `(${lit(`${today} ${String(hour).padStart(2, "0")}:15:00`)}::timestamp at time zone ${lit(tz)})`;
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Co`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} DBDev`)}, ${company},
  (select id from public.project_types where code = 'DBDV'), 1) returning id`));
const lead = Number(sql(`insert into public.leads (project_id, company_name) values (${project}, ${lit(`${TAG} Plumbing`)}) returning id`));
sql(`insert into public.pay_events (user_id, project_id, lead_id, kind, amount, created_at) values
  (${SEAN}, ${project}, ${lead}, 'lead', 10, ${local(8)}), (${SEAN}, ${project}, ${lead}, 'lead', 10, ${local(9)}),
  (${SEAN}, ${project}, ${lead}, 'appointment', 40, ${local(9)})`);
const goalBefore = sql(`select coalesce(row_to_json(g)::text, '') from public.production_goals g where month = ${lit(month)}`);
sql(`delete from public.production_goals where month = ${lit(month)}`);

const browser = await launchBrowser({ mouse: true });
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1100 });
  await admin.go("/", 5000);
  const chart = () => admin.ev(`document.querySelector('[data-production-chart]')?.innerText ?? ''`);
  const current = () => admin.ev(`document.querySelector('[data-chart-ranges] [aria-current]')?.textContent ?? ''`);

  section("In place of Lead Volume: what the team developed");
  check("the chart, and no Lead Volume", Boolean(await until(async () => /Leads & Appointments Developed/i.test(await chart()))) && !/Lead Volume/i.test(await admin.text()));
  check("1D to begin with: today from 5 AM to 6 PM, counted up to 100", (await current()) === "1D" && /5 AM/.test(await chart()) && /6 PM/.test(await chart()) && /\b100\b/.test(await chart()), await current());
  const leads = await admin.ev(`document.querySelector('[data-production-stats="leads"]')?.innerText ?? ''`);
  check("…today's leads and appointments, with high, low, average an hour and per hour worked",
    /LEADS\s*[2-9]/i.test(leads) && /High/i.test(leads) && /Avg \/ hour/i.test(leads) && /Per hour/i.test(leads), leads);
  check("…both lines", await admin.ev(`!!document.querySelector('[data-line="leads"]') && !!document.querySelector('[data-line="appts"]')`));
  await admin.click('[data-chart-series] button', "Appointments");
  check("one or the other", Boolean(await until(() => admin.ev(`!document.querySelector('[data-line="leads"]') && !!document.querySelector('[data-line="appts"]')`))));
  await admin.click('[data-chart-series] button', "Both");

  section("Ranges, stock-chart style");
  for (const r of ["5D", "1M", "YTD"]) {
    await admin.click("[data-chart-ranges] a", r);
    check(`${r}`, Boolean(await until(async () => (await current()) === r && (await admin.url()).includes(`pr=${r}`))), await admin.url());
  }
  check("…by the day, its average a day", /Avg \/ (day|week)/i.test(await chart()));
  await admin.go("/?pr=1Y", 4000);
  check("More: a year (or two, or a range of one's own)", /1 year/.test(await admin.ev(`document.querySelector('[data-chart-more]')?.textContent ?? ''`)) && Boolean(await admin.ev(`!!document.querySelector('[data-chart-custom]')`)));

  section("One manager");
  await admin.go(`/?pu=${SEAN}`, 4000);
  check("narrowed to Sean: his leads today", Boolean(await until(async () => /LEADS\s*[2-9]/i.test(await admin.ev(`document.querySelector('[data-production-stats="leads"]')?.innerText ?? ''`)))));

  section("The month's goals");
  await admin.click("[data-production-goals]");
  await until(() => admin.ev(`!!document.querySelector('[data-goals-form]')`));
  await admin.fill('[data-goal-calc="leads"] input[aria-label="Lead managers"]', "5");
  await admin.fill('[data-goal-calc="leads"] input[aria-label="Hours a day each"]', "4");
  const worked = await admin.ev(`document.querySelector('[data-goal-calc="leads"] strong')?.textContent`);
  const days = Number(sql(`select count(*) from generate_series(${lit(month)}::date, (${lit(month)}::date + interval '1 month - 1 day')::date, interval '1 day') d where extract(isodow from d) < 6`));
  check("worked out from the team: lead managers × hours a day × working days × 3 an hour", worked === (5 * 4 * days * 3).toLocaleString("en-US"), `${worked} with ${days} days`);
  await admin.click('[data-use-calc="leads"]');
  await admin.fill('[data-goals-form] input[name="appts_goal"]', "400");
  await admin.click("[data-goals-form] button[type=submit]", "Save goals");
  check("saved for the month", Boolean(await until(() => sql(`select leads_goal || '/' || appts_goal from public.production_goals where month = ${lit(month)}`) === `${5 * 4 * days * 3}/400`)));
  await admin.go("/?pr=1M", 4000);
  check("…and the chart says how much of the goal for the days shown is reached (a month's working days)",
    Boolean(await until(async () => /\d+%[\s\S]*goal \d/i.test(await admin.ev(`document.querySelector('[data-production-stats="leads"]')?.innerText ?? ''`)))),
    await admin.ev(`document.querySelector('[data-production-stats="leads"]')?.innerText ?? ''`));

  section("Others");
  const agent = await (await browser.newContext({ as: "agent@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await agent.go("/", 4000);
  check("an agent keeps their Lead Volume", /Lead Volume/i.test(await agent.text()) && !(await agent.ev(`!!document.querySelector('[data-production-chart]')`)));
} finally {
  browser.close();
  sql(`delete from public.production_goals where month = ${lit(month)}`);
  if (goalBefore) sql(`insert into public.production_goals select * from json_populate_record(null::public.production_goals, ${lit(goalBefore)}::json)`);
  sql(`delete from public.pay_events where lead_id = ${lead}`);
  sql(`delete from public.leads where id = ${lead}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("production chart");
