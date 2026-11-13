/**
 * Pay and bonus additions on screen (Sean, Nov 2026):
 *   a lead's Policy Files: "Dec sheet received", ticked once its file is there, paid the project's rate
 *   a lead's Special Pay: asked for by its manager, approved (adjusted) by the client's Sales Rep
 *   Lead-Corrected on a lead with no developer: the lead manager who developed it chosen, their pay moved
 *   the project's dec sheet rate, set by the client's Sales Rep
 *   Settings › Bonus Plans, and the Pay report's Extras, Bonus and summary
 *
 * Works on its own client and projects and removes everything it made.
 *
 *   node tests/run.mjs tests/e2e/pay-extras.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `PAYX-E2E ${Date.now()}`;
const id = (email) => Number(sql(`select id from public.users where email = ${lit(email)}`));
const SEAN = id("sean@beacon.test");
const MIKE = id("mike@beacon.test");
const RACHEL = id("rachel@beacon.test");
const typeId = (code) => sql(`select id from public.project_types where code=${lit(code)}`);
const company = Number(sql(`insert into public.companies (name, sales_rep_id) values (${lit(`${TAG} Insurance`)}, ${RACHEL}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, lead_rate, appointment_rate, confirmation_rate)
  values (${lit(`${TAG} Appointments`)}, ${company}, ${typeId("APPT")}, 1, 11, 35, 5) returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id, lead_rate)
  values (${lit(`${TAG} DBDev`)}, ${company}, ${typeId("DBDV")}, 1, ${APPT}, 10) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${DBDV}, ${SEAN}), (${APPT}, ${MIKE})`);
const leadA = Number(sql(`insert into public.leads (company_name, project_id, assigned_user_id) values (${lit(`${TAG} Acme Roofing`)}, ${DBDV}, ${SEAN}) returning id`));
sql(`insert into public.documents (name, file_type, storage_path, lead_id, uploaded_by) values ('dec page.pdf', 'application/pdf', ${lit(`test/${TAG}/a.pdf`)}, ${leadA}, ${SEAN})`);
const leadB = Number(sql(`insert into public.leads (company_name, project_id, assigned_user_id, stage) values (${lit(`${TAG} Best Plumbing`)}, ${APPT}, ${MIKE}, 'appt') returning id`));
sql(`insert into public.insurance_details (lead_id, ultimate_xdate) values (${leadB}, '2027-01-01')`);
const events = (leadId) => JSON.parse(sql(`select coalesce(json_agg(json_build_object('user', user_id, 'kind', kind, 'amount', amount::float) order by id), '[]') from public.pay_events where lead_id = ${leadId}`));

const browser = await launchBrowser();
try {
  section("Dec Sheet Pay on a lead");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1500, height: 1000 });
  await sean.go(`/leads/${leadA}?tab=files`, 6000);
  check("Policy Files: the dec sheet box, unticked, saying the rate", Boolean(await until(() => sean.ev(`document.querySelector('[data-dec-sheet="off"]')?.innerText.includes('$10') ?? false`))));
  await sean.ev(`document.querySelector('[data-dec-sheet-box]').click()`);
  check("ticked: it says what was added", /Dec sheet received: \$10 added to your pay/.test((await sean.waitToast(/Dec sheet/)) ?? ""));
  check("…paid once, to Sean", Boolean(await until(() => events(leadA).filter((e) => e.kind === "dec_sheet").length === 1)) && events(leadA)[0].user === SEAN, JSON.stringify(events(leadA)));
  check("…and the box shows it marked", Boolean(await until(() => sean.ev(`!!document.querySelector('[data-dec-sheet="on"]')`))));

  section("Special Pay asked for");
  await sean.ev(`document.querySelector('[data-special-pay-ask]').click()`);
  await until(() => sean.ev(`!!document.querySelector('[data-special-pay-form]')`));
  check("…going to the client's Sales Rep", /Rachel Colestock/.test(await sean.ev(`document.querySelector('[data-special-pay-form]').innerText`)));
  await sean.fill('[data-special-pay-form] input[name="amount"]', "25");
  await sean.fill('[data-special-pay-form] input[name="reason"]', "Owner meeting across two locations");
  await sean.click("[data-special-pay-form] button[type=submit]", "Send request");
  check("sent", /Special Pay request sent to Rachel Colestock/.test((await sean.waitToast(/Special Pay request/)) ?? ""));
  check("…waiting on the lead", Boolean(await until(() => sean.ev(`!!document.querySelector('[data-special-pay-request="pending"]')`))));
  check("…the asker can't decide it", !(await sean.ev(`!!document.querySelector('[data-special-pay-decide]')`)));

  const rachel = await (await browser.newContext({ as: "rachel@beacon.test" })).newPage({ width: 1500, height: 1000 });
  await rachel.go(`/leads/${leadA}`, 6000);
  check("the Sales Rep sees it, to approve or decline", Boolean(await until(() => rachel.ev(`!!document.querySelector('[data-special-pay-decide]')`))));
  await rachel.fill('[data-special-pay-decide] input[aria-label="Amount approved"]', "20");
  await rachel.click("[data-special-pay-approve]", "Approve");
  check("approved at $20", /Approved: \$20 added to Sean Fitzgerald's pay/.test((await rachel.waitToast(/Approved/)) ?? ""));
  check("…paid to Sean", Boolean(await until(() => events(leadA).some((e) => e.kind === "request" && e.amount === 20 && e.user === SEAN))), JSON.stringify(events(leadA)));

  section("The project's dec sheet rate");
  // Set on the project's page, which is an administrator's (managers don't open Projects); the database
  // lets the client's Sales Rep set it too (tests/integration/pay-extras).
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 1000 });
  await admin.go(`/projects/${DBDV}`, 6000);
  check("on the project page", Boolean(await until(() => admin.ev(`!!document.querySelector('[data-dec-sheet-rate] select')`))));
  await admin.fill("[data-dec-sheet-rate] select", "25");
  check("set to $25", Boolean(await until(() => Number(sql(`select dec_sheet_rate from public.projects where id = ${DBDV}`)) === 25)));

  section("Lead-Corrected on a lead with no developer");
  const mike = await (await browser.newContext({ as: "mike@beacon.test" })).newPage({ width: 1500, height: 1000 });
  await mike.go(`/leads/${leadB}`, 6000);
  await until(() => mike.ev(`[...document.querySelectorAll('button[aria-pressed]')].some((b) => b.textContent.trim() === 'Lead-Corrected')`));
  await mike.ev(`[...document.querySelectorAll('button[aria-pressed]')].find((b) => b.textContent.trim() === 'Lead-Corrected').click()`);
  check("asks who developed it, the lead managers to choose from, or nobody",
    Boolean(await until(() => mike.ev(`(() => { const s = document.querySelector('select[data-lead-manager]'); return !!s && [...s.options].some((o) => o.textContent.startsWith('Sean')) && [...s.options].some((o) => o.value === '0'); })()`))));
  await mike.fill('input[aria-label="Corrected renewal date"]', "10/1/27");
  await mike.ev("document.activeElement?.blur()");
  await mike.click("button", "Save:");
  check("saved without one: it says to choose", Boolean(await until(() => mike.ev(`[...document.querySelectorAll('[role=alert], [data-slot=error], .text-destructive')].some((e) => /lead manager/i.test(e.textContent))`))));
  await mike.fill("select[data-lead-manager]", String(SEAN));
  await until(() => mike.ev(`document.querySelector('select[data-lead-manager]')?.value === '${SEAN}'`));
  await sleep(300);
  await mike.click("button", "Save:");
  check("chosen: Sean charged the project's $11, Mike paid it", Boolean(await until(() => {
    const e = events(leadB);
    return e.some((x) => x.user === SEAN && x.amount === -11) && e.some((x) => x.user === MIKE && x.kind === "corrected" && x.amount === 11);
  }, { timeout: 10000 })), JSON.stringify(events(leadB)));
  check("…Sean kept as its developer", Number(sql(`select dbdv_user_id from public.leads where id = ${leadB}`)) === SEAN);

  section("Settings › Bonus Plans, and the Pay report");
  await admin.go("/settings", 6000);
  check("the bonus plans, with their tiers", Boolean(await until(() => admin.ev(`(() => { const c = document.querySelector('[data-bonus-plans]'); return !!c && c.querySelector('[name="lead_weekly_at_0"]')?.value === '50' && c.querySelector('[name="appt_monthly_amount_1"]')?.value === '500'; })()`))));
  await admin.go(`/reports/pay?user=${SEAN}`, 8000);
  const summary = await until(() => admin.ev(`document.querySelector('[data-pay-summary="${SEAN}"]')?.innerText ?? null`));
  check("Sean's summary: his dec sheet and Special Pay", /Dec sheets\s*\d+\s*\$/.test(summary ?? "") && /Special Pay asked for\s*\d+\s*\$/.test(summary ?? ""), summary);
  check("…the Extras and Bonus columns", await admin.ev(`!!document.querySelector('[data-person="${SEAN}"] [data-extras]') && !!document.querySelector('[data-person="${SEAN}"] [data-bonus]')`));
  await admin.go(`/reports/pay?user=${MIKE}`, 8000);
  check("Mike's summary: the lead he corrected", /Lead-Corrected\s*[1-9]\d*\s*\$/.test((await until(() => admin.ev(`document.querySelector('[data-pay-summary="${MIKE}"]')?.innerText ?? null`))) ?? ""));
  await sleep(200);
} finally {
  browser.close();
  const leads = `select id from public.leads where project_id in (${DBDV}, ${APPT})`;
  sql(`delete from public.notifications where (title like ${lit(`%${TAG}%`)} or title like 'Special Pay%') and created_at > now() - interval '1 hour'`);
  sql(`delete from public.special_pay_requests where lead_id in (${leads})`);
  sql(`delete from public.pay_events where lead_id in (${leads})`);
  sql(`delete from public.call_records where lead_id in (${leads})`);
  sql(`delete from public.documents where storage_path like ${lit(`test/${TAG}/%`)}`);
  sql(`delete from public.activity_log where (entity = 'lead' and entity_id in (${leads})) or (entity = 'project' and entity_id in (${DBDV}, ${APPT}))`);
  sql(`delete from public.leads where project_id in (${DBDV}, ${APPT})`);
  sql(`delete from public.project_assignments where project_id in (${DBDV}, ${APPT})`);
  sql(`delete from public.projects where id in (${DBDV}, ${APPT})`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("pay extras on screen");
