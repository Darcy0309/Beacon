/**
 * Project Goals, narrowed and ordered (Oct 2026): by the client's Sales Rep
 * and the kind of project (DB Dev or Appts), each with All; and ordered by
 * leads or appointments owed or % complete, high or low, the projects
 * without that goal last.
 *
 * Removes everything it made.
 *
 *   node tests/e2e/project-goals.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `PG-E2E ${Date.now()}`;
const SEAN = Number(sql("select id from public.users where email = 'sean@beacon.test'"));
const MIKE = Number(sql("select id from public.users where email = 'mike@beacon.test'"));
const company = (name, rep) => Number(sql(`insert into public.companies (name, sales_rep_id) values (${lit(`${TAG} ${name}`)}, ${rep}) returning id`));
const type = (code) => `(select id from public.project_types where code = '${code}')`;
const project = (co, name, code, goals) => Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, ${Object.keys(goals).join(", ")})
  values (${lit(`${TAG} ${name}`)}, ${co}, ${type(code)}, 1, ${Object.values(goals).join(", ")}) returning id`));
const A = company("Sean's Client", SEAN);
const B = company("Mike's Client", MIKE);
const A2 = project(A, "A Appts", "APPT", { lead_goal: 300, appt_goal: 40 });
const A1 = project(A, "A DBDev", "DBDV", { lead_goal: 100, appt_project_id: A2 });
const B1 = project(B, "B DBDev", "DBDV", { lead_goal: 50 });
// 30 leads A1 developed, on A2: A1 30 of 100 (30%, 70 owed), A2 30 of 300 (10%, 270 owed); B1 0 of 50 (0%, 50 owed).
sql(`insert into public.leads (company_name, project_id, source_project_id, result_id)
  select ${lit(`${TAG} Lead `)} || g, ${A2}, ${A1}, public.call_result_from_text('APPT', 'Lead-No Contact') from generate_series(1, 30) g`);

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1600, height: 1000 });
  // Our projects, in the order the list shows them.
  const ours = async (query) => {
    await admin.go(`/reports/goals${query}`, 5000);
    return until(async () => {
      const ids = await admin.ev(`[...document.querySelectorAll('[data-goal-row]')].map((r) => Number(r.dataset.goalRow))`);
      return ids.length || /No projects to show/.test(await admin.text()) ? ids.filter((id) => [A1, A2, B1].includes(id)) : null;
    });
  };
  const named = (ids) => (ids ?? []).map((id) => ({ [A1]: "A1", [A2]: "A2", [B1]: "B1" })[id]).join(",");

  section("Filters, each with All");
  await admin.go("/reports/goals", 5000);
  const labels = await until(async () => { const t = await admin.ev(`document.querySelector('[data-goal-filters]')?.innerText.replace(/\\s+/g, ' ') ?? ''`); return /Order/.test(t) && t; }, { timeout: 15000 });
  check("Sales Rep, Type and Order beside Show", /Sales Rep/.test(labels) && /Type/.test(labels) && /Order/.test(labels) && /Show/.test(labels), labels);
  check("all three projects with no filter", named(await ours("")).split(",").sort().join() === "A1,A2,B1");
  check("a Sales Rep's clients' projects", named(await ours(`?rep=${SEAN}`)).split(",").sort().join() === "A1,A2", named(await ours(`?rep=${SEAN}`)));
  check("…the other rep's", named(await ours(`?rep=${MIKE}`)) === "B1");
  check("DB Dev projects", named(await ours("?type=DBDV")).split(",").sort().join() === "A1,B1");
  check("Appts projects", named(await ours("?type=APPT")) === "A2");
  check("both at once", named(await ours(`?rep=${SEAN}&type=DBDV`)) === "A1");

  section("Ordered high or low");
  check("leads owed, most first", named(await ours("?sort=leads_owed")) === "A2,A1,B1", named(await ours("?sort=leads_owed")));
  check("…fewest first", named(await ours("?sort=leads_owed_low")) === "B1,A1,A2");
  check("leads % complete, highest first", named(await ours("?sort=leads_pct")) === "A1,A2,B1", named(await ours("?sort=leads_pct")));
  check("…lowest first", named(await ours("?sort=leads_pct_low")) === "B1,A2,A1");
  check("appts owed: the one with an appointment goal first, those without it last, either way",
    named(await ours("?sort=appts_owed")).startsWith("A2") && named(await ours("?sort=appts_owed_low")).startsWith("A2"), `${named(await ours("?sort=appts_owed"))} / ${named(await ours("?sort=appts_owed_low"))}`);
  check("with a filter too", named(await ours(`?rep=${SEAN}&sort=leads_owed_low`)) === "A1,A2");
} finally {
  browser.close();
  sql(`delete from public.leads where project_id in (${A1}, ${A2}, ${B1})`);
  sql(`delete from public.projects where id in (${A1}, ${B1})`);
  sql(`delete from public.projects where id = ${A2}`);
  sql(`delete from public.companies where id in (${A}, ${B})`);
}

finish("project goals");
