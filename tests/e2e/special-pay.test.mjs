/**
 * Special Pay in the browser (Sean, Oct 2026): an administrator sets a DB dev
 * project's goal and Special Pay a lead in its pay rates (a goal without an
 * amount is refused beside the field); an appointment project's, on its
 * appointments (Sean, Nov 2026), paid on each once a rep hits it and taken back
 * with an appointment found invalid; the project page and Production & Pay's rates show it; a rep who
 * hits it is told, and their pay summary shows Special Pay apart from the
 * commission, on the page and in the CSV; confirmation pay goes by its name.
 *
 *   npm run test:e2e
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `SPE-TEST ${Date.now()}`;
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const SEAN = userId("sean@beacon.test");
const MIKE = userId("mike@beacon.test");
const typeId = (code) => sql(`select id from public.project_types where code=${lit(code)}`);
const LEAD_RESULT = Number(sql("select id from public.call_results where project_type='DBDV' and name='Lead'"));
const companyId = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appointment_rate, confirmation_rate)
  values (${lit(`${TAG} Appointments`)}, ${companyId}, ${typeId("APPT")}, 1, 40, 10) returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id, lead_rate)
  values (${lit(`${TAG} DBDev`)}, ${companyId}, ${typeId("DBDV")}, 1, ${APPT}, 8) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${DBDV}, ${SEAN}), (${APPT}, ${MIKE})`);

const browser = await launchBrowser();
const when = (page, expr, timeout = 25000) => until(() => page.ev(expr), { timeout });
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });

  section("Set in an appointment project's pay rates (Sean, Nov 2026)");
  await admin.go(`/projects/${APPT}`, 6000);
  await admin.click("button", "Pay rates");
  await when(admin, "!!document.querySelector('[data-special-pay-form]')");
  const form = await admin.ev("document.querySelector('[role=dialog]')?.innerText ?? ''");
  check("an appointment project: Special Pay on its appointments, and its confirmation pay by name",
    /Goal \(appointments a pay period\)/.test(form) && /Special Pay an appointment/.test(form) && /sets this many appointments/.test(form) && /Confirmation pay/.test(form), form);
  await admin.fill("input[name=special_goal]", "2");
  await admin.fill("input[name=special_rate]", "5");
  await admin.ev("document.querySelector('[data-special-pay-form]').closest('form').requestSubmit()");
  check("saved: 2 appointments a pay period, $5 each", Boolean(await until(() => sql(`select special_goal || '/' || special_rate from public.projects where id=${APPT}`) === "2/5.00", { timeout: 15000 })));
  await admin.go(`/projects/${APPT}`, 5000);
  const apptLine = await admin.ev("document.querySelector('[data-special-pay]')?.textContent ?? ''");
  check("the project page says so", /Special Pay \$5\.00 an appointment at 2 appointments a pay period/.test(apptLine), apptLine);

  const mikeSb = await signIn("mike@beacon.test");
  const SET = Number(sql("select id from public.call_results where project_type='APPT' and name='Appointment'"));
  const INVALID = Number(sql("select id from public.call_results where project_type='APPT' and name='Appointment-Invalid'"));
  const tomorrow = sql("select ((now() at time zone public.business_tz())::date + 1)::text");
  const apptLeads = [];
  for (let i = 1; i <= 3; i += 1) {
    const lead = Number(sql(`insert into public.leads (company_name, project_id, assigned_user_id, stage) values (${lit(`${TAG} Appt ${i}`)}, ${APPT}, ${MIKE}, 'appt') returning id`));
    apptLeads.push(lead);
    const { error } = await mikeSb.sb.rpc("record_call_result", { p_lead_id: lead, p_result_id: SET, p_notes: null, p_appointment: { date: tomorrow, time: `${8 + i}:00 AM` }, p_corrected_xdate: null, p_ultimate_xdate: "2027-03-01" });
    if (error) throw error;
    if (i === 1) check("one appointment: short of the goal, no Special Pay yet", sql(`select count(*) from public.pay_events where kind='special' and project_id=${APPT}`) === "0");
  }
  check("the goal hit: $5 Special Pay on each appointment, the one after it too",
    sql(`select count(*) || '/' || sum(amount) || '/' || count(distinct appointment_id) from public.pay_events where kind='special' and project_id=${APPT} and user_id=${MIKE}`) === "3/15.00/3");
  const mikePage = await (await browser.newContext({ as: "mike@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await mikePage.go("/notifications", 6000);
  check("Mike is told", Boolean(await when(mikePage, `document.body.innerText.includes(${JSON.stringify(`Special Pay: you hit 2 appointments on ${TAG} Appointments`)})`)));
  const { error: invalidError } = await mikeSb.sb.rpc("record_call_result", { p_lead_id: apptLeads[0], p_result_id: INVALID, p_notes: "Owner cancelled", p_appointment: null, p_corrected_xdate: null, p_ultimate_xdate: null });
  if (invalidError) throw invalidError;
  check("an appointment found invalid takes its own Special Pay back, no other",
    sql(`select coalesce(sum(amount), 0) from public.pay_events where kind='special' and project_id=${APPT} and user_id=${MIKE}`) === "10.00"
    && sql(`select count(*) from public.pay_events where kind='special' and is_chargeback and lead_id=${apptLeads[0]}`) === "1", sql(`select coalesce(sum(amount), 0) from public.pay_events where kind='special' and project_id=${APPT}`));

  section("Set in a DB dev project's pay rates");

  await admin.go(`/projects/${DBDV}`, 6000);
  await admin.click("button", "Pay rates");
  await when(admin, "!!document.querySelector('[data-special-pay-form]')");
  check("a DB dev project: its goal and Special Pay a lead", await admin.ev("!!document.querySelector('input[name=special_goal]') && !!document.querySelector('input[name=special_rate]')"));
  await admin.fill("input[name=special_goal]", "5");
  await admin.ev("document.querySelector('[data-special-pay-form]').closest('form').requestSubmit()");
  check("a goal without an amount: said beside the amount", Boolean(await when(admin, "/Set what the Special Pay is each/.test(document.querySelector('[role=dialog]')?.innerText ?? '')")));
  await admin.fill("input[name=special_rate]", "1");
  await admin.ev("document.querySelector('[data-special-pay-form]').closest('form').requestSubmit()");
  check("saved", /Pay rates saved/.test((await admin.waitToast(/Pay rates saved|could not|fix|Special Pay/i)) ?? ""), await admin.toasts());
  check("…5 leads a pay period, $1 a lead", await until(() => sql(`select special_goal || '/' || special_rate from public.projects where id=${DBDV}`) === "5/1.00"));
  await admin.go(`/projects/${DBDV}`, 5000);
  const line = await admin.ev("document.querySelector('[data-special-pay]')?.textContent ?? ''");
  check("the project page says so", /Special Pay \$1\.00 a lead at 5 leads a pay period/.test(line), line);

  section("Production & Pay's rates");
  await admin.go("/reports/production#rates", 6000);
  const rate = await admin.ev(`document.querySelector('tr[data-project="${DBDV}"] [data-special-pay]')?.textContent ?? ''`);
  const heads = await admin.ev("[...document.querySelectorAll('#rates th')].map((t) => t.textContent.trim())");
  check("Confirmation pay and Special Pay columns, this project's goal in it", heads.includes("Confirmation pay") && heads.includes("Special Pay") && /\$1\.00 a lead at 5 leads/.test(rate), `${heads.join(" | ")} — ${rate}`);

  section("A rep hits the goal");
  const sean = await signIn("sean@beacon.test");
  for (let i = 1; i <= 5; i += 1) {
    const lead = Number(sql(`insert into public.leads (company_name, project_id, assigned_user_id) values (${lit(`${TAG} Co ${i}`)}, ${DBDV}, ${SEAN}) returning id`));
    const { error } = await sean.sb.rpc("record_call_result", { p_lead_id: lead, p_result_id: LEAD_RESULT, p_notes: null, p_appointment: null, p_corrected_xdate: null, p_ultimate_xdate: "2027-03-01" });
    if (error) throw error;
  }
  check("five leads: $1 Special Pay on each", sql(`select count(*) || '/' || sum(amount) from public.pay_events where kind='special' and project_id=${DBDV} and user_id=${SEAN}`) === "5/5.00");
  const rep = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await rep.go("/notifications", 6000);
  check("Sean is told", Boolean(await when(rep, `document.body.innerText.includes(${JSON.stringify(`Special Pay: you hit 5 leads on ${TAG} DBDev`)})`)));

  section("On Sean's pay summary");
  await rep.go("/reports/pay", 6000);
  await when(rep, `!!document.querySelector('tr[data-person="${SEAN}"]')`);
  const tile = await rep.ev("[...document.querySelectorAll('[data-panel]')].find((p) => /^special pay$/i.test(p.querySelector('.stat-label')?.textContent.trim() ?? ''))?.innerText.replace(/\\s+/g, ' ') ?? ''");
  check("a Special Pay tile: $5.00 on 5 leads", /\$5\.00/.test(tile) && /5 leads or appointments on a project goal hit/.test(tile), tile);
  const cells = await rep.ev(`[...document.querySelector('tr[data-person="${SEAN}"]').cells].map((c) => c.innerText.trim())`);
  const heads2 = await rep.ev("[...document.querySelectorAll('thead th')].map((t) => t.textContent.trim())");
  const at = (h) => cells[heads2.indexOf(h)];
  check("its own column, apart from the commission", at("Special Pay") === "$5.00" && heads2.indexOf("Special Pay") === heads2.indexOf("Commission") + 1, JSON.stringify(cells));
  const csv = (await rep.ev("fetch('/api/reports/pay').then((r) => r.text())")).replace(/^﻿/, "").split(/\r?\n/);
  const cols = csv[0].split(",");
  const row = csv.find((l) => l.startsWith("Sean Fitzgerald"))?.split(",") ?? [];
  check("…and in the CSV, after the commission", cols.indexOf("Special Pay (USD)") === cols.indexOf("Commission (USD)") + 1 && row[cols.indexOf("Special Pay (USD)")] === "5.00", `${csv[0]} | ${row.join(",")}`);

  section("Production & Pay, by rep");
  await admin.go(`/reports/production?period=today&project=${DBDV}`, 6000);
  const byRep = await admin.ev(`document.querySelector('tr[data-rep="${SEAN}"] [data-special-pay]')?.textContent ?? ''`);
  check("Sean's Special Pay beside his pay", byRep === "$5.00", byRep);
} finally {
  browser.close();
  const like = lit(`${TAG}%`);
  sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)} or body like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.pay_events where project_id in (${DBDV}, ${APPT})`);
  sql(`update public.call_records set appointment_id = null where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.appointments where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.leads where company_name like ${like}`);
  sql(`delete from public.project_assignments where project_id in (${DBDV}, ${APPT})`);
  sql(`update public.projects set appt_project_id = null where id = ${DBDV}`);
  sql(`delete from public.projects where id in (${DBDV}, ${APPT})`);
  sql(`delete from public.companies where id = ${companyId}`);
}

finish("special pay (browser)");
