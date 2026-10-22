/**
 * X-Dates by Month's filters and the Pipeline Report (Sean, Oct 2026): by
 * Sales Rep, renewal months, DB dev or appointments, projects and managers
 * (several at once); the report by project and manager, the buckets adding
 * up, conversion, a stale last call in red, the managers sharing a project
 * on hover, the sample's CSV; and managers' own report, on their projects,
 * opening a project's call list, their filters kept for the day.
 *
 *   npm run test:e2e
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `PIPE-TEST ${Date.now()}`;
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const RACHEL = Number(sql("select id from public.users where email='rachel@beacon.test'"));
const MIKE = Number(sql("select id from public.users where email='mike@beacon.test'"));
const typeId = (c) => sql(`select id from public.project_types where code=${lit(c)}`);
const today = sql("select (now() at time zone public.business_tz())::date");
const month = (n) => Number(sql(`select extract(month from ('${today}'::date + interval '${n} month'))::int`));
const [M1, M2] = [month(1), month(2)];
// The client is on Eastern time; only the DB dev project has a time zone of its own (Pacific).
const company = Number(sql(`insert into public.companies (name, sales_rep_id, timezone_id) values (${lit(`${TAG} Insurance`)}, ${MIKE}, 1) returning id`));
const P = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, state, appointment_rate, confirmation_rate)
  values (${lit(`${TAG} Trucking_Appts`)}, ${company}, ${typeId("APPT")}, 1, 'AZ', 35, 5) returning id`));
const Q = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, state, lead_rate, special_goal, special_rate, timezone_id)
  values (${lit(`${TAG} Churches_DBDev`)}, ${company}, ${typeId("DBDV")}, 1, 'NE', 9, 5, 1, 4) returning id`));
// Sean works both; Rachel shares the first.
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${P}, ${SEAN}), (${P}, ${RACHEL}), (${Q}, ${SEAN})`);
const result = (type, cond) => sql(`select id from public.call_results where project_type = '${type}' and ${cond} order by id limit 1`);
const APPT = result("APPT", "effect = 'appointment'");
const VIABLE = result("APPT", "viable and callable and coalesce(effect, '') not in ('appointment', 'confirm')");
const OFF = result("APPT", "not viable and coalesce(effect, 'none') not in ('appointment', 'confirm', 'appointment_invalid')");
const DBV = result("DBDV", "viable and callable");
let n = 0;
const name = (project, user, res, m) => {
  n += 1;
  const id = Number(sql(`insert into public.leads (company_name, project_id, assigned_user_id, result_id, stage)
    values (${lit(`${TAG} Co ${n}`)}, ${project}, ${user}, ${res}, '${project === P ? "appt" : "dbdev"}') returning id`));
  sql(`insert into public.insurance_details (lead_id, ultimate_xdate) values (${id}, make_date(extract(year from '${today}'::date)::int + 1, ${m}, 12))`);
  return id;
};
// On the Appointments project, Sean's: next month 2 appointments, 1 off, 3 viable; the month after, 2 viable. Rachel's: 1 viable.
for (const [res, m] of [[APPT, M1], [APPT, M1], [OFF, M1], [VIABLE, M1], [VIABLE, M1], [VIABLE, M1], [VIABLE, M2], [VIABLE, M2]]) name(P, SEAN, res, m);
name(P, RACHEL, VIABLE, M1);
// On the DB dev project, Sean's: 4 next month.
for (let i = 0; i < 4; i += 1) name(Q, SEAN, DBV, M1);
// Sean's last call on the Appointments project 12 days ago (behind); on the DB dev one, today.
sql(`insert into public.call_records (user_id, project_id, call_date, notes) values (${SEAN}, ${P}, now() - interval '12 days', ${lit(TAG)}), (${SEAN}, ${Q}, now(), ${lit(TAG)})`);
const L1 = Number(sql(`select min(id) from public.leads where company_name like ${lit(`${TAG}%`)} and project_id = ${P}`));
sql(`insert into public.appointments (lead_id, project_id, set_project_id, user_id, appt_date, appt_time, qa_status, appt_create_date)
  values (${L1}, ${P}, ${P}, ${SEAN}, '${today}'::date + 3, '10:00 AM', 'passed', '${today}'::date - 5)`);

const browser = await launchBrowser();
const when = (page, expr, timeout = 25000) => until(() => page.ev(expr), { timeout });
const rowText = (page, key) => page.ev(`document.querySelector('[data-pipeline-row="${key}"]')?.innerText.replace(/\\s+/g, ' ') ?? ''`);
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1600, height: 1100 });

  section("X-Dates by Month: the filters");
  await admin.go(`/reports/x-dates?client=${company}`, 7000);
  await when(admin, "!!document.querySelector('[data-pipeline-report]')");
  const labels = await admin.ev("[...document.querySelectorAll('[data-xdate-filters] .eyebrow, [data-xdate-filters] button')].map((e) => e.textContent.trim()).join(' | ')");
  check("Client, Sales Rep, Type, Project, Manager and Renewal month", ["Client", "Sales Rep", "Type", "Project", "Manager", "Renewal month"].every((l) => labels.includes(l)), labels);
  check("…projects, managers and months as drop-downs of check boxes, All at the top",
    (await admin.ev("['project', 'managers', 'months'].every((k) => !!document.querySelector(`[data-param-multi=\"${k}\"]`))")) === true);

  section("The Pipeline Report");
  const sean = await rowText(admin, `${P}-${SEAN}`);
  check("a row for each project and manager: the next three months, by month", Boolean(sean), sean);
  const cells = await admin.ev(`[...document.querySelector('[data-pipeline-row="${P}-${SEAN}"]').cells].map((c) => c.innerText.trim())`);
  // Project, TZ, ST, Manager, last appt, last worked, calls, M1, M2, M3, total, appts, off, viable, pay, special, rep, conv, shared
  check("…its counts: 6 and 2, 8 in all; 2 appointments, 1 off, 5 viable (adding up)", cells[7] === "6" && cells[8] === "2" && cells[10] === "8"
    && cells[11] === "2" && cells[12] === "1" && cells[13] === "5", JSON.stringify(cells));
  check("…conversion: appointments of all (25%), pay $35 and $5, Sales Rep Mike P", cells[17] === "25%" && cells[14] === "$35" && cells[15] === "$5" && cells[16] === "Mike P", JSON.stringify(cells));
  check("…last appointment set, and a last call 12 days ago in red", /\d+\/\d+\/\d\d/.test(cells[4])
    && Boolean(await admin.ev(`document.querySelector('[data-pipeline-row="${P}-${SEAN}"]').dataset.stale`)), JSON.stringify(cells));
  check("…the DB dev project, worked today, not red, its pay a lead's ($9)", !(await admin.ev(`document.querySelector('[data-pipeline-row="${Q}-${SEAN}"]')?.dataset.stale`))
    && /\$9/.test(await rowText(admin, `${Q}-${SEAN}`)));
  const qCells = await admin.ev(`[...document.querySelector('[data-pipeline-row="${Q}-${SEAN}"]').cells].map((c) => c.innerText.trim().replace(/\\s+/g, ' '))`);
  check("…its Special Pay a lead at its goal, not a confirmation's", qCells[15] === "$1 at 5 leads", JSON.stringify(qCells));
  check("the time zone: the project's own (PST), none when it has none (not the client's EST)", qCells[1] === "PST" && cells[1] === "—", `${qCells[1]} / ${cells[1]}`);
  // Focus opens it as hover does (a toast in the corner could sit over the badge for the mouse).
  await admin.ev(`document.querySelector('[data-pipeline-row="${P}-${SEAN}"] [data-shared]').scrollIntoView({ block: 'center' })`);
  await sleep(300);
  await admin.ev(`document.querySelector('[data-pipeline-row="${P}-${SEAN}"] [data-shared]').focus()`);
  const tip = await until(() => admin.ev(`(() => { const t = document.querySelector('[data-tip-open="shared-${P}-${SEAN}"]'); if (!t || t.style.visibility === 'hidden') return null;
    const r = t.getBoundingClientRect(); return { text: t.textContent, inWindow: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth }; })()`));
  check("…shared with one other manager: Rachel, on hover or focus, over the page", (await admin.ev(`document.querySelector('[data-pipeline-row="${P}-${SEAN}"] [data-shared]')?.dataset.shared`)) === "1"
    && /Rachel/.test(tip?.text ?? "") && tip.inWindow, JSON.stringify(tip));
  check("…by manager, then the one last worked longest ago", await admin.ev(`(() => { const keys = [...document.querySelectorAll('[data-pipeline-row]')].map((r) => r.dataset.pipelineRow);
    const a = keys.indexOf('${P}-${SEAN}'), b = keys.indexOf('${Q}-${SEAN}'); return a >= 0 && b > a; })()`));
  // The export: as the sample.
  await admin.ev(`window.__csv = null; const make = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { b.text().then((t) => { window.__csv = t; }); return make(b); };
    const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) return; return click.call(this); };`);
  await admin.click("[data-export-pipeline]");
  const csv = ((await until(() => admin.ev("window.__csv"))) ?? "").replace(/^﻿/, "").split(/\r\n/);
  const MON = (m) => ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][m - 1];
  check("Export CSV: the sample's columns, a row each", csv[0] === `projectname,TimeZone,ST,Manager,last appt set,LastWorked,Calls,${MON(M1)},${MON(M2)},${MON(month(3))},Total,Appts,OffTheList,ViableLeft,PAY,SpecialPay,SalesRep,Conv%,SharedWith`
    && csv.some((l) => l.startsWith(`${TAG} Trucking_Appts,,AZ,Sean F,`) && l.includes(",6,2,0,8,2,1,5,$35,$5,Mike P,25%,Rachel C"))
    && csv.some((l) => l.startsWith(`${TAG} Churches_DBDev,PST,NE,Sean F,`) && l.includes(",$9,$1,Mike P,")), JSON.stringify(csv.slice(0, 4)));

  section("Filtered");
  await admin.go(`/reports/x-dates?client=${company}&managers=${RACHEL}`, 6000);
  await when(admin, "!!document.querySelector('[data-pipeline-report]')");
  check("by manager: Rachel's alone", Boolean(await rowText(admin, `${P}-${RACHEL}`)) && !(await rowText(admin, `${P}-${SEAN}`)));
  await admin.go(`/reports/x-dates?client=${company}&type=DBDV`, 6000);
  await when(admin, "!!document.querySelector('[data-pipeline-report]')");
  check("DB dev only", Boolean(await rowText(admin, `${Q}-${SEAN}`)) && !(await rowText(admin, `${P}-${SEAN}`)));
  await admin.go(`/reports/x-dates?client=${company}&months=${M2}`, 6000);
  await when(admin, "!!document.querySelector('[data-pipeline-report]')");
  const m2 = await admin.ev(`[...document.querySelector('[data-pipeline-row="${P}-${SEAN}"]')?.cells ?? []].map((c) => c.innerText.trim())`);
  check("a renewal month: its column alone, the chart's others faded", m2[7] === "2" && m2[8] === "2" && !(await rowText(admin, `${Q}-${SEAN}`))
    && (await admin.ev(`document.querySelector('[data-month-column="${M2}"]')?.dataset.picked`)) === "true", JSON.stringify(m2));
  await admin.go(`/reports/x-dates?rep=${MIKE}&project=${P},${Q}`, 6000);
  await when(admin, "!!document.querySelector('[data-pipeline-report]')");
  check("by Sales Rep and two projects at once", Boolean(await rowText(admin, `${P}-${SEAN}`)) && Boolean(await rowText(admin, `${Q}-${SEAN}`)));

  section("A manager's own Pipeline Report");
  const mgr = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1600, height: 1100 });
  await mgr.go("/reports/pipeline", 7000);
  check("in their Data & Insights", Boolean(await when(mgr, "!!document.querySelector('aside nav a[href=\"/reports/pipeline\"]')")));
  await when(mgr, "!!document.querySelector('[data-pipeline-report]')");
  // A short report: the months list still shows all twelve, scrolling to December.
  await mgr.mouseClick('[data-param-multi="months"] > button');
  const months = '[data-param-multi-list="months"]';
  await when(mgr, `!!document.querySelector('${months} [data-option="12"]')`);
  await mgr.ev(`document.querySelector('${months} [role=listbox]').scrollTop = 1e6`);
  await sleep(200);
  const dec = await mgr.ev(`(() => { const o = document.querySelector('${months} [data-option="12"]'); const r = o.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { bottom: Math.round(r.bottom), window: innerHeight, reachable: !!hit && o.contains(hit) }; })()`);
  check("the Renewal month list scrolls all the way to December, over the card's edge", dec.reachable && dec.bottom <= dec.window, JSON.stringify(dec));
  await mgr.key("Escape");
  check("their projects' rows, each project opening its call list", (await mgr.ev(`document.querySelector('[data-pipeline-row="${P}-${SEAN}"] [data-pipeline-project]')?.getAttribute('href')`)) === `/work/${P}`);
  await mgr.go(`/reports/pipeline?months=${M2}&project=${P}`, 6000);
  await when(mgr, "!!document.querySelector('[data-pipeline-report]')");
  await mgr.go("/", 3000);
  await mgr.go("/reports/pipeline", 4000);
  check("coming back the same day: their filters are still on", Boolean(await until(async () => /months=/.test(await mgr.ev("location.search")) || null, { timeout: 15000 }))
    && /project=/.test(await mgr.ev("location.search")), await mgr.ev("location.search"));
} finally {
  browser.close();
  const like = lit(`${TAG}%`);
  sql(`delete from public.appointments where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.insurance_details where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.leads where company_name like ${like}`);
  sql(`delete from public.call_records where notes = ${lit(TAG)}`);
  sql(`delete from public.project_assignments where project_id in (${P}, ${Q})`);
  sql(`delete from public.projects where id in (${P}, ${Q})`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("pipeline");
