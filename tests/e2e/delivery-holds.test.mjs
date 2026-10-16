/**
 * Leads and appointments held in QA before they go to the client (Sean, Oct
 * 2026), end to end, with the test's mail catcher standing in for the mail
 * service: with Settings › Delivery holding leads, a call that makes a name
 * a Lead emails nobody and waits on the QA page; an administrator holds it
 * back with a note, its manager is told and sees it on the lead sheet,
 * marks it fixed, and the hourly clearing sends it; a held appointment goes
 * as an administrator passes its QA.
 *
 * Needs the app started with SMTP_HOST=127.0.0.1 SMTP_PORT=2525 (any
 * SMTP_USER and SMTP_PASSWORD), and PUSH_DELIVER_SECRET set to TEST_PUSH_SECRET
 * (lighthouse-local-flush-test unless given): the database's own call.
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { startMailCatcher } from "../support/smtp.mjs";
import { APP_URL } from "../support/env.mjs";

const SECRET = process.env.TEST_PUSH_SECRET ?? "lighthouse-local-flush-test";
const RUN = Date.now();
const TAG = `DH ${RUN}`;
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const TO = `leads.${RUN}@capital.test`;
const typeId = (code) => sql(`select id from public.project_types where code=${lit(code)}`);
const mailSetting = sql("select value::text from public.app_settings where key = 'mail'");
const deliveryBefore = sql("select coalesce((select value::text from public.app_settings where key = 'delivery'), '')");
sql(`update public.app_settings set value = value || '{"from": "alerts@signaturemktg.net"}'::jsonb where key = 'mail'`);
// Leads held, appointments held; the schedule clears every hour, all day (so the test's hour is one).
sql(`insert into public.app_settings (key, value) values ('delivery', '{"leads":"hold","appointments":"hold","every":1,"from":0,"to":23,"zone":"America/Los_Angeles"}')
  on conflict (key) do update set value = excluded.value`);

const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Capital Insurance`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, email) values (${lit(`${TAG} Appointments`)}, ${company}, ${typeId("APPT")}, 1, ${lit(TO)}) returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id, email)
  values (${lit(`${TAG} Churches`)}, ${company}, ${typeId("DBDV")}, 1, ${APPT}, ${lit(TO)}) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${DBDV}, ${SEAN}), (${APPT}, ${SEAN})`);
const church = Number(sql(`insert into public.leads (company_name, contact_name, phone, city, state, project_id, assigned_user_id)
  values (${lit(`${TAG} Calvary Baptist Church`)}, 'Pasty', '310-829-2481', 'Santa Monica', 'CA', ${DBDV}, ${SEAN}) returning id`));
sql(`insert into public.insurance_details (lead_id, ultimate_xdate, pkg_xdate) values (${church}, '2026-12-23', '2026-12-23')`);

const mail = await startMailCatcher(2525);
const browser = await launchBrowser();
const sent = () => mail.messages.filter((m) => m.to.includes(TO));
const hold = (lead) => JSON.parse(sql(`select coalesce(json_agg(t order by t.id), '[]') from (select id, kind, status, note, fixed_at from public.delivery_holds where lead_id = ${lead}) t`));
const pick = (page, name) => page.ev(`(() => { const b = [...document.querySelectorAll('button[aria-pressed]')].find((x) => x.textContent.trim() === ${JSON.stringify(name)}); if (!b) return false; b.click(); return true; })()`);
const flush = () => fetch(`${APP_URL}/api/delivery/flush`, { method: "POST", headers: { "content-type": "application/json", "x-push-secret": SECRET }, body: "{}" }).then((r) => r.json().then((j) => ({ status: r.status, ...j })));

try {
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1500, height: 1100 });
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 1100 });

  section("Settings › Delivery");
  await admin.go("/settings", 5000);
  check("how leads and appointments go to clients, and when held ones go", await admin.ev(`!!document.querySelector('[data-delivery-settings] select[name="leads"]') && document.querySelector('[data-delivery-settings] select[name="appointments"]').value === 'hold'`));

  section("A Lead, held");
  await sean.go(`/leads/${church}`, 4000);
  await pick(sean, "Lead");
  await until(() => sean.ev(`!!document.querySelector('input[name="ultimate_xdate"]')`));
  await sean.click("button", "Save:");
  const held = await until(() => { const h = hold(church); return h.length ? h : null; }, { timeout: 15000 });
  await sleep(2500);
  check("it waits in QA, kind lead", held?.[0]?.kind === "lead" && held?.[0]?.status === "held", JSON.stringify(held));
  check("…and nothing goes to the client yet", sent().length === 0, JSON.stringify(mail.messages.map((m) => m.to)));

  section("Waiting to send, on the QA page");
  await admin.go("/qa", 5000);
  const row = `[data-held="${held[0].id}"]`;
  check("listed, with the delivery said above it", Boolean(await until(() => admin.ev(`!!document.querySelector('${row}')`)))
    && /Leads: held for QA/.test((await admin.ev(`document.querySelector('[data-delivery-summary]')?.textContent`)) ?? ""));
  await admin.click(`${row} [data-hold-back]`);
  await until(() => admin.ev(`!!document.querySelector('[data-hold-back-dialog] textarea[name="note"]')`));
  await admin.fill('[data-hold-back-dialog] textarea[name="note"]', "The decision maker's email is missing");
  await admin.click("[data-hold-back-dialog] button[type=submit]");
  check("held back: not sent, the note kept", Boolean(await until(() => hold(church)[0]?.status === "failed")) && hold(church)[0].note.includes("email is missing"));
  check("…its manager told", Number(sql(`select count(*) from public.notifications where user_id = ${SEAN} and title = ${lit(`Held back by QA: ${TAG} Calvary Baptist Church`)}`)) === 1);
  check("the clearing leaves it alone", (await flush()).sent === 0 && sent().length === 0);

  section("The manager fixes it");
  await sean.go(`/leads/${church}`, 4000);
  check("the lead sheet says what to fix", /email is missing/.test((await until(() => sean.ev(`document.querySelector('[data-hold-notice]')?.innerText`))) ?? ""));
  await sean.click("[data-hold-fixed]");
  check("Fixed puts it back in line", Boolean(await until(() => hold(church)[0]?.status === "held" && hold(church)[0]?.fixed_at)));

  section("The hourly clearing");
  const unsigned = await fetch(`${APP_URL}/api/delivery/flush`, { method: "POST", body: "{}" });
  check("only the database's own call clears them", unsigned.status === 401, String(unsigned.status));
  const cleared = await flush();
  check("in a clearing hour it sends what is held", cleared.due === true && cleared.sent >= 1, JSON.stringify(cleared));
  check("…the lead to the client, and kept as sent", Boolean(await until(() => sent().length === 1, { timeout: 15000 })) && hold(church)[0]?.status === "sent",
    JSON.stringify(mail.messages.map((m) => m.to)));

  section("A held appointment goes as it passes QA");
  const shop = Number(sql(`insert into public.leads (company_name, contact_name, project_id, assigned_user_id) values (${lit(`${TAG} Grace Chapel`)}, 'Dana', ${APPT}, ${SEAN}) returning id`));
  const result = Number(sql("select id from public.call_results where project_type = 'APPT' and name = 'Appointment'"));
  const call = Number(sql(`insert into public.call_records (lead_id, project_id, user_id, call_date, result_id, call_result, stage) values (${shop}, ${APPT}, ${SEAN}, now(), ${result}, 'Appointment', 'appt') returning id`));
  const appt = Number(sql(`insert into public.appointments (lead_id, user_id, project_id, appt_date, appt_time, qa_status, call_record_id)
    values (${shop}, ${SEAN}, ${APPT}, (now() at time zone public.business_tz())::date + 3, '10:00 AM', 'pending', ${call}) returning id`));
  sql(`update public.call_records set appointment_id = ${appt} where id = ${call}`);
  sql(`insert into public.delivery_holds (lead_id, call_record_id, appointment_id, kind, label, user_id, project_id) values (${shop}, ${call}, ${appt}, 'appointment', 'Appointment', ${SEAN}, ${APPT})`);
  await admin.go("/qa", 5000);
  await until(() => admin.ev(`[...document.querySelectorAll('[data-list-row]')].some((r) => r.innerText.includes(${JSON.stringify(`${TAG} Grace Chapel`)}))`));
  await admin.ev(`(() => { const r = [...document.querySelectorAll('[data-list-row]')].find((x) => x.innerText.includes(${JSON.stringify(`${TAG} Grace Chapel`)})); [...r.querySelectorAll('button')].find((b) => /Pass/.test(b.textContent))?.click(); })()`);
  check("passed in QA, its email goes to the client", Boolean(await until(() => sent().length === 2, { timeout: 15000 })) && hold(shop)[0]?.status === "sent"
    && sql(`select qa_status from public.appointments where id = ${appt}`) === "passed", JSON.stringify(hold(shop)));
} finally {
  browser.close();
  await mail.close();
  const like = lit(`${TAG}%`);
  sql(`update public.app_settings set value = ${lit(mailSetting)}::jsonb where key = 'mail'`);
  if (deliveryBefore) sql(`update public.app_settings set value = ${lit(deliveryBefore)}::jsonb where key = 'delivery'`);
  else sql("delete from public.app_settings where key = 'delivery'");
  sql(`delete from public.delivery_holds where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.lead_deliveries where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)} or body like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.pay_events where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`update public.call_records set appointment_id = null where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.appointments where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.activity_log where entity = 'lead' and entity_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.call_records where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.leads where company_name like ${like}`);
  sql(`delete from public.project_assignments where project_id in (${DBDV}, ${APPT})`);
  sql(`update public.projects set appt_project_id = null where id = ${DBDV}`);
  sql(`delete from public.projects where id in (${DBDV}, ${APPT})`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("delivery holds");
