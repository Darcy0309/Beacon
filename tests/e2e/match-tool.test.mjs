/**
 * The Match Tool (Sean, Nov 2026): in Data & Insights; a row a project with
 * its goal, leads, owed, % done, matches (those renewing soon too), developed
 * and matched since its start, Start, Due and days behind, to export; a
 * project's matches by renewal month, so many brought to DB Dev at
 * Viable-Staged or on to the appointment project as leads. Administrators only.
 *
 * Removes everything it made.
 *
 *   node tests/e2e/match-tool.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `MT-E2E ${Date.now()}`;
const type = (code) => sql(`select id from public.project_types where code = '${code}'`);
const company = (name) => Number(sql(`insert into public.companies (name) values (${lit(`${TAG} ${name}`)}) returning id`));
const C1 = company("Client"), C2 = company("Other");
const PA = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts`)}, ${C1}, ${type("APPT")}, 1) returning id`));
const P = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id, lead_goal, start_date, end_date)
  values (${lit(`${TAG} DBDev`)}, ${C1}, ${type("DBDV")}, 1, ${PA}, 10, current_date - 30, current_date + 60) returning id`));
const Q = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Old`)}, ${C2}, ${type("APPT")}, 4) returning id`));
const lead = (project, name, phone, ins = null) => {
  const id = Number(sql(`insert into public.leads (company_name, project_id, phone, city, state) values (${lit(`${TAG} ${name}`)}, ${project}, ${lit(phone)}, 'Phoenix', 'AZ') returning id`));
  if (ins) sql(`insert into public.insurance_details (lead_id, ${Object.keys(ins).join(", ")}) values (${id}, ${Object.values(ins).map(lit).join(", ")})`);
  return id;
};
// Elsewhere: one renewing in March, one in December.
lead(Q, "Acme Plumbing", "602-555-2001", { wc_xdate: "2025-03-01", wc_carrier: "Amtrust Ins Co" });
lead(Q, "Best Roofing", "602-555-2002", { pkg_xdate: "2024-12-20", pkg_carrier: "West Bend Ins Co" });
const T1 = lead(P, "Acme Plumbing", "602-555-2001");
const T2 = lead(P, "Best Roofing", "602-555-2002");
lead(P, "Nobody Else", "602-555-2003");
const at = (id) => sql(`select l.project_id || '|' || r.name || '|' || (l.matched_at is not null) from public.leads l join public.call_results r on r.id = l.result_id where l.id = ${id}`);

const browser = await launchBrowser({ mouse: true });
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 1000 });

  section("The report");
  await admin.go("/reports/matches", 9000);
  check("in Data & Insights, as Match Tool", await admin.ev(`!!document.querySelector('aside a[href="/reports/matches"]')`));
  const cells = () => admin.ev(`(() => { const r = document.querySelector('[data-match-row="${P}"]'); return r ? [...r.cells].map((c) => c.textContent.trim()) : null; })()`);
  const row = await until(cells, { timeout: 15000 });
  // Client, Project, Goal, Leads, Owed, Done, Matches, Renew soon, Developed, Matches added, Start, Due, Days behind
  check("a project's goal, leads, owed, % done and matches", JSON.stringify(row?.slice(2, 7)) === JSON.stringify(["10", "0", "10", "0%", "2"]), JSON.stringify(row));
  check("…developed and matched since its start, and days behind its Due Date", row?.[8] === "0" && row?.[9] === "0" && Number(row?.[12]) > 0, JSON.stringify(row));
  await admin.ev(`window.__csv = null; const make = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { b.text().then((t) => { window.__csv = t; }); return make(b); };
    const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) return; return click.call(this); };`);
  await admin.click("[data-export-matches]");
  const csv = ((await until(() => admin.ev("window.__csv"))) ?? "").replace(/^﻿/, "").split(/\r\n/);
  check("…to export, as the old report's columns", csv[0]?.startsWith("Client Name,ProjectName,ProjectStatus,ProjectGoal,ActualLeads,LeadsOwed,%Complete,LeadMatches")
    && csv.some((l) => l.includes(`${TAG} DBDev,Active,10,0,10,0%,2,0,0`)), JSON.stringify(csv.slice(0, 2)));

  section("A project's matches");
  await admin.ev(`document.querySelector('[data-match-row="${P}"] [data-match-link]').click()`);
  check("its matches open", Boolean(await until(async () => (await admin.path()) === `/reports/matches/${P}` && admin.ev(`document.querySelectorAll('[data-match]').length === 2`), { timeout: 15000 })), await admin.url());
  const dec = await admin.ev(`document.querySelector('[data-match-month="12"]')?.textContent.trim()`);
  check("by renewal month, each with how many", /Dec\s*1/.test(dec ?? "") && /Mar\s*1/.test(await admin.ev(`document.querySelector('[data-match-month="3"]')?.textContent.trim()`)), dec);
  await admin.ev(`document.querySelector('[data-match-month="12"]').click()`);
  check("December picked: its match, to add", Boolean(await until(() => admin.ev(`document.querySelectorAll('[data-match]').length === 1 && !!document.querySelector('[data-match="${T2}"][data-picked]')`))));
  await admin.ev(`document.querySelector('[data-match-to="dbdev"]').click()`);
  await admin.click("[data-add-matches-go]");
  const said = await admin.waitToast(/match(es)? added/, 10000);
  check("…brought to DB Dev at Viable-Staged", /1 match added to DB Dev/.test(said ?? "") && at(T2) === `${P}|Viable-Staged|true`, `${said} / ${at(T2)}`);
  check("…and off the list", Boolean(await until(() => admin.ev(`document.querySelectorAll('[data-match]').length === 1 && !!document.querySelector('[data-match="${T1}"]')`), { timeout: 10000 })));
  await admin.ev(`document.querySelector('[data-match-to="appt"]').click()`);
  await admin.click("[data-add-matches-go]");
  const said2 = await admin.waitToast(/to the appointment project/, 10000);
  check("the rest on to the appointment project as leads", /1 match added to the appointment project/.test(said2 ?? "") && at(T1) === `${PA}|Lead-No Contact|true`, `${said2} / ${at(T1)}`);

  section("Back on the report");
  await admin.go("/reports/matches", 7000);
  const after = await until(async () => { const r = await cells(); return r?.[9] === "2" && r; }, { timeout: 15000 });
  check("1 lead in, none developed, 2 matches added, none left", JSON.stringify([after?.[3], after?.[6], after?.[8], after?.[9]]) === JSON.stringify(["1", "0", "0", "2"]), JSON.stringify(after));

  section("Administrators only");
  const manager = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1400, height: 900 });
  await manager.go("/reports/matches", 6000);
  check("a manager can't open it", !(await manager.ev("!!document.querySelector('[data-match-report]')")) && /don.t have access|not found/i.test(await manager.text()));
} finally {
  browser.close();
  const like = lit(`${TAG}%`);
  sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)} or body like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.activity_log where action = 'matches.add' and entity_id = ${P}`);
  sql(`update public.leads set matched_from_lead_id = null where company_name like ${like}`);
  sql(`delete from public.insurance_details where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.leads where company_name like ${like}`);
  sql(`update public.projects set appt_project_id = null where id = ${P}`);
  sql(`delete from public.projects where id in (${P}, ${PA}, ${Q})`);
  sql(`delete from public.companies where id in (${C1}, ${C2})`);
}

finish("match tool");
