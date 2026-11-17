/**
 * Texts to a client's producers (Sean, Nov 2026: "the option to receive text messages in addition to emails for
 * new appointments, appointment confirmations, & reschedules"), end to end: a producer's mobile and Texts tick
 * saved in Project Info and shown on it; then an appointment set, moved and confirmed on the lead sheet texts
 * that producer each time (from Lighthouse's number, here to a stand-in for Twilio), and not one left unticked;
 * each text kept once.
 *
 * Needs the app started with Twilio keys, SMTP_HOST=127.0.0.1 SMTP_PORT=2525, and
 *   TWILIO_API_URL=http://127.0.0.1:4812     (the stand-in this test runs)
 * and TEST_TWILIO_ACCOUNT_SID given here (the app's own). Skipped without it.
 */
import { createServer } from "node:http";
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { startMailCatcher } from "../support/smtp.mjs";

if (!process.env.TEST_TWILIO_ACCOUNT_SID) {
  console.log("Skipped: give TEST_TWILIO_ACCOUNT_SID (the app's own) to run the producer text checks.");
  process.exit(0);
}
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n / 2))].map((b) => b.toString(16).padStart(2, "0")).join("");

// Twilio's Messages API, stood in for: every text asked for.
const asked = [];
const twilio = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    asked.push(Object.fromEntries(new URLSearchParams(raw)));
    res.setHeader("content-type", "application/json");
    res.statusCode = 201;
    res.end(JSON.stringify({ sid: `SM${hex(32)}`, status: "queued" }));
  });
});
await new Promise((r) => twilio.listen(4812, "127.0.0.1", r));

const RUN = Date.now();
const TAG = `PTXT-E2E ${RUN}`;
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const tail = String(RUN).slice(-4);
const JOSH_MOBILE = `602556${tail}`;
const AMY_MOBILE = `480556${tail}`;
const deliveryBefore = sql("select coalesce((select value::text from public.app_settings where key = 'delivery'), '')");
sql(`insert into public.app_settings (key, value) values ('delivery', '{"leads":"now","appointments":"now","every":0}') on conflict (key) do update set value = excluded.value`);
const mailSetting = sql("select value::text from public.app_settings where key = 'mail'");
sql(`update public.app_settings set value = value || '{"from": "alerts@signaturemktg.net"}'::jsonb where key = 'mail'`);

const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Capital Insurance`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, email, contact_name)
  values (${lit(`${TAG} Trucking_Appts`)}, ${company}, (select id from public.project_types where code='APPT'), 1, ${lit(`leads.${RUN}@capital.test`)}, 'Bret Godsey') returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${APPT}, ${SEAN})`);
const lead = Number(sql(`insert into public.leads (company_name, contact_name, phone, contact_mobile, city, state, project_id, assigned_user_id)
  values (${lit(`${TAG} ABC Trucking`)}, 'Joe Smith', '602-555-0100', '602-555-0111', 'Phoenix', 'AZ', ${APPT}, ${SEAN}) returning id`));
// An appointment needs the renewal date on file.
sql(`insert into public.insurance_details (lead_id, ultimate_xdate, pkg_xdate) values (${lead}, '2027-03-15', '2027-03-15')`);
const day = (n) => sql(`select ((now() at time zone public.business_tz())::date + ${n})::text`);
const us = (iso) => `${iso.slice(5, 7)}/${iso.slice(8)}/${iso.slice(0, 4)}`;
const kept = () => JSON.parse(sql(`select coalesce(json_agg(t order by t.id), '[]') from (select id, kind, to_number, status, body from public.producer_texts where lead_id = ${lead}) t`));
const pick = (page, name) => page.ev(`(() => { const b = [...document.querySelectorAll('button[aria-pressed]')].find((x) => x.textContent.trim() === ${JSON.stringify(name)}); if (!b) return false; b.click(); return true; })()`);

const mail = await startMailCatcher(2525);
const browser = await launchBrowser();
try {
  section("Project Info: a producer's mobile, ticked for texts");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await admin.go(`/projects/${APPT}`, 6000);
  await until(() => admin.ev("!!document.querySelector('[data-project-info-card] [data-edit-project-info]')"));
  await admin.click("[data-project-info-card] [data-edit-project-info]");
  await until(() => admin.ev("!!document.querySelector('[data-dialog-content] [data-project-info-form]')"), { timeout: 8000 });
  await admin.fill('[data-dialog-content] input[name="producer_first_1"]', "Josh");
  await admin.fill('[data-dialog-content] input[name="producer_last_1"]', "Huray");
  await admin.click('[data-dialog-content] [data-producer="1"] [data-producer-texts]');
  await admin.click("[data-dialog-content] [data-save-project-info]");
  const asks = await until(() => admin.ev(`document.querySelector('[data-dialog-content] [data-producer="1"] [role=alert]')?.textContent ?? null`));
  check("Texts without a mobile is refused: add their mobile", asks === "Add their mobile to text them", asks);
  await admin.fill('[data-dialog-content] input[name="producer_mobile_1"]', `(602) 556-${tail}`);
  await admin.fill('[data-dialog-content] input[name="producer_first_2"]', "Amy");
  await admin.fill('[data-dialog-content] input[name="producer_mobile_2"]', `480-556-${tail}`);
  await admin.click("[data-dialog-content] [data-save-project-info]");
  const saved = await until(() => {
    const p = JSON.parse(sql(`select coalesce((select producers::text from public.project_profiles where project_id = ${APPT}), '[]')`));
    return p.length === 2 ? p : null;
  }, { timeout: 10000 });
  check("saved: Josh's mobile, ticked; Amy's, not", saved?.[0]?.mobile === JOSH_MOBILE && saved?.[0]?.texts === true && saved?.[1]?.mobile === AMY_MOBILE && saved?.[1]?.texts === false, JSON.stringify(saved));
  await admin.go(`/projects/${APPT}`, 5000);
  const badge = await until(() => admin.ev(`document.querySelector('[data-project-info-card] [data-gets-texts]')?.textContent ?? null`));
  check("…and Project Info says he gets texts, to which number", badge === `Texts to 602-556-${tail}`, badge);

  section("An appointment set: the producer is texted");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1500, height: 1000 });
  const setAppt = async (result, date, time) => {
    await sean.go(`/leads/${lead}?project=${APPT}`, 6000);
    // Picked again until the sheet answers (a press before it is ready is lost).
    const opened = await until(async () => (await pick(sean, result)) && (await sleep(400), sean.ev(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === ${JSON.stringify(`Save: ${result}`)})`)), { timeout: 20000 });
    if (!opened) console.log("  (the result did not open)");
    if (date) {
      await until(() => sean.ev(`!!document.querySelector('input[aria-label="Appointment date"]')`));
      await sean.fill('input[aria-label="Appointment date"]', us(date));
      await sean.ev("document.activeElement.blur()");
      await until(() => sean.ev(`document.querySelector('input[name="appt_date"]')?.value === ${JSON.stringify(date)}`));
      await sean.fill('select[name="appt_time"]', time);
    }
    await sleep(300);
    await sean.click("button", "Save:");
    const said = await until(() => sean.ev(`[...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.innerText).filter((t) => !/notifications/.test(t)).join(' / ') || null`), { timeout: 8000 });
    if (!/saved/.test(said ?? "")) console.log("  (not saved)", said, await sean.ev(`[...document.querySelectorAll('[role=alert]')].map((a) => a.innerText).join(' / ')`));
  };
  const D1 = day(5);
  const D2 = day(6);
  await setAppt("Appointment", D1, "10:00 AM");
  const first = await until(() => (asked.length >= 1 ? asked[0] : null), { timeout: 20000 });
  check("a text to Josh's mobile, from Lighthouse's number", first?.To === `+1${JOSH_MOBILE}` && Boolean(first?.From || first?.MessagingServiceSid), JSON.stringify(first));
  check("…saying a new appointment, the business, when, and whom to meet", /: New appointment: .*ABC Trucking, .* at 10:00 AM\. Joe Smith, 602-555-0111\. Details are in your email\. Reply STOP to opt out\.$/.test(first?.Body ?? ""), first?.Body);
  check("…the client's email still goes", Boolean(await until(() => mail.messages.some((m) => m.to.includes(`leads.${RUN}@capital.test`)), { timeout: 15000 })));
  await sleep(1500);
  check("not to Amy, who isn't ticked", !asked.some((a) => a.To === `+1${AMY_MOBILE}`), JSON.stringify(asked.map((a) => a.To)));

  section("Moved, then confirmed");
  await setAppt("Appointment", D2, "2:30 PM");
  const moved = await until(() => asked.find((a) => /Appointment rescheduled/.test(a.Body)) ?? null, { timeout: 20000 });
  check("moved to another day: “Appointment rescheduled … now <the new day> at 2:30 PM”", /Appointment rescheduled: .*ABC Trucking, now .* at 2:30 PM\./.test(moved?.Body ?? ""), moved?.Body);
  await setAppt("Appointment-Confirmed");
  const confirmed = await until(() => asked.find((a) => /Appointment confirmed/.test(a.Body)) ?? null, { timeout: 20000 });
  check("confirmed: “Appointment confirmed”, no email line", /Appointment confirmed: .*ABC Trucking, .* at 2:30 PM\. Joe Smith/.test(confirmed?.Body ?? "") && !/Details are in your email/.test(confirmed?.Body ?? ""), confirmed?.Body);
  await sleep(1500);
  const rows = kept();
  check("each kept once, to Josh alone: new, rescheduled, confirmed", JSON.stringify(rows.map((r) => [r.kind, r.to_number])) === JSON.stringify([["new", `+1${JOSH_MOBILE}`], ["rescheduled", `+1${JOSH_MOBILE}`], ["confirmed", `+1${JOSH_MOBILE}`]])
    && asked.length === 3, JSON.stringify(rows));
} finally {
  browser.close();
  twilio.close();
  await mail.close();
  sql(`update public.app_settings set value = ${lit(mailSetting)}::jsonb where key = 'mail'`);
  if (deliveryBefore) sql(`update public.app_settings set value = ${lit(deliveryBefore)}::jsonb where key = 'delivery'`);
  else sql("delete from public.app_settings where key = 'delivery'");
  sql(`delete from public.producer_texts where lead_id = ${lead}`);
  sql(`delete from public.lead_deliveries where lead_id = ${lead}`);
  sql(`delete from public.pay_events where lead_id = ${lead}`);
  sql(`update public.call_records set appointment_id = null where lead_id = ${lead}`);
  sql(`delete from public.appointments where lead_id = ${lead}`);
  sql(`delete from public.activity_log where entity = 'lead' and entity_id = ${lead}`);
  sql(`delete from public.notifications where body like ${lit(`%${TAG}%`)} or title like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.call_records where lead_id = ${lead}`);
  sql(`delete from public.insurance_details where lead_id = ${lead}`);
  sql(`delete from public.leads where id = ${lead}`);
  sql(`delete from public.project_profiles where project_id = ${APPT}`);
  sql(`delete from public.project_assignments where project_id = ${APPT}`);
  sql(`delete from public.projects where id = ${APPT}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("producer texts");
