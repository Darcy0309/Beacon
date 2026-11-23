/**
 * An appointment's reminder text sent now (Sean, Nov 2026: "an option for managers to send out directly along with
 * the scheduled time … managers can resend to prospects if they ever say they never received the text"): from the
 * lead's Appointments, sent again as often as asked, the scheduled one still to go; a reply to it read as the
 * scheduled one's is; and refused on a project with reminder texts off.
 *
 * Needs the app started with Twilio keys (any), TWILIO_API_URL=http://127.0.0.1:4811 (the stand-in this runs), and
 * TEST_TWILIO_ACCOUNT_SID / TEST_TWILIO_AUTH_TOKEN as the app's. Skipped without them.
 *
 *   node tests/run.mjs tests/e2e/reminder-now.test.mjs
 */
import { createServer } from "node:http";
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { APP_URL } from "../support/env.mjs";
import { twilioSignature } from "../../src/lib/twilio-voice.js";

const ACCOUNT = process.env.TEST_TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TEST_TWILIO_AUTH_TOKEN;
if (!ACCOUNT || !TOKEN) {
  console.log("Skipped: give TEST_TWILIO_ACCOUNT_SID and TEST_TWILIO_AUTH_TOKEN (the app's own).");
  process.exit(0);
}
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n / 2))].map((b) => b.toString(16).padStart(2, "0")).join("");
const asked = [];
const twilio = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    asked.push(Object.fromEntries(new URLSearchParams(raw)));
    res.setHeader("content-type", "application/json");
    res.statusCode = 201;
    res.end(JSON.stringify({ sid: `SM${hex(32)}`, status: "queued", from: "+15555550100" }));
  });
});
await new Promise((r) => twilio.listen(4811, "127.0.0.1", r));

const TAG = `RNOW ${Date.now()}`;
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const MOBILE = `480557${String(Date.now()).slice(-4)}`;
const tomorrow = sql("select (public.business_today() + 1)::text");
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Capital Insurance`)}) returning id`));
const project = (on) => Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, contact_name, appt_texts)
  values (${lit(`${TAG} ${on ? "on" : "off"}`)}, ${company}, (select id from public.project_types where code='APPT'), 1, 'Bret Godsey', ${on}) returning id`));
const ON = project(true);
const OFF = project(false);
const lead = (pid, name) => Number(sql(`insert into public.leads (company_name, project_id, contact_name, contact_mobile, assigned_user_id) values (${lit(`${TAG} ${name}`)}, ${pid}, 'Marco Diaz', ${lit(MOBILE)}, ${SEAN}) returning id`));
const L = lead(ON, "Gardner Electric");
const L_OFF = lead(OFF, "Desert Haulers");
const appt = (l, pid) => Number(sql(`insert into public.appointments (lead_id, project_id, set_project_id, appt_date, appt_time, rep_name, user_id)
  values (${l}, ${pid}, ${pid}, ${lit(tomorrow)}, '10:00 AM', 'Jen Carter', ${SEAN}) returning id`));
const A = appt(L, ON);
const A_OFF = appt(L_OFF, OFF);
const texts = (l) => Number(sql(`select count(*) from public.lead_texts where lead_id = ${l} and appointment_id is not null and direction = 'out'`));

const browser = await launchBrowser();
try {
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1400, height: 1000 });

  section("Sent now, from the lead's Appointments");
  await sean.go(`/leads/${L}`, 6000);
  await until(() => sean.ev(`!![...document.querySelectorAll('[role=tab]')].find((t) => t.textContent.includes('Appointments'))`), { timeout: 30000 });
  await sean.click('[role=tab]', "Appointments");
  check("each upcoming appointment: Send reminder, not sent yet", Boolean(await until(() => sean.ev(`document.querySelector('[data-appt-reminder="${A}"]')?.innerText.includes('Not sent yet') && !!document.querySelector('[data-send-reminder="${A}"]')`), { timeout: 30000 })));
  await sean.click(`[data-send-reminder="${A}"]`);
  check("sent to the prospect's mobile, the reminder's wording", Boolean(await until(() => (asked.length === 1 ? asked : null))) && asked[0].To === `+1${MOBILE}` && /reminder of your appointment with Jen Carter/.test(asked[0].Body), JSON.stringify(asked[0]));
  const row = JSON.parse(sql(`select row_to_json(t)::text from (select appointment_id, user_id, status from public.lead_texts where lead_id = ${L} and appointment_id is not null) t`) || "null");
  check("…kept on its Conversation, tied to the appointment, by Sean", row?.appointment_id === A && row.user_id === SEAN && row.status === "queued", JSON.stringify(row));
  check("…said on the row: sent, by whom", Boolean(await until(() => sean.ev(`/Sent .* by Sean/.test(document.querySelector('[data-appt-reminder="${A}"] [data-reminder-last]')?.innerText ?? '')`))));
  check("…the scheduled one still to go", sql(`select count(*) from public.appointment_texts where appointment_id = ${A} and sent_at is not null`) === "0");

  section("Sent again");
  await sean.click(`[data-send-reminder="${A}"]`);
  check("Send again: a second text", Boolean(await until(() => texts(L) === 2)) && asked.length === 2);

  section("Its reply");
  const url = `${APP_URL}/api/twilio/sms`;
  const params = { AccountSid: ACCOUNT, From: `+1${MOBILE}`, To: "+15555550100", Body: "Y", NumMedia: "0", MessageSid: `SM${hex(32)}` };
  await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": twilioSignature(TOKEN, url, params) }, body: new URLSearchParams(params) });
  const told = await until(() => sql(`select title from public.notifications where user_id = ${SEAN} and body ilike ${lit(`%${TAG} Gardner%`)} and title ilike '%replied Y%' order by id desc limit 1`) || null, { timeout: 10000 });
  check("a Y to it tells the appointment's manager it's confirmed, as the scheduled one's would", Boolean(told), told);

  section("A project with reminder texts off");
  await sean.go(`/leads/${L_OFF}`, 6000);
  await sean.click('[role=tab]', "Appointments");
  await until(() => sean.ev(`!!document.querySelector('[data-send-reminder="${A_OFF}"]')`));
  await sean.click(`[data-send-reminder="${A_OFF}"]`);
  check("refused, saying why", /reminder texts are off/i.test((await sean.waitToast(/off for this project/, 8000)) ?? "") && texts(L_OFF) === 0, await sean.toasts());
} finally {
  browser.close();
  twilio.close();
  sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)} or body like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.lead_texts where lead_id in (${L}, ${L_OFF})`);
  sql(`delete from public.appointment_texts where appointment_id in (${A}, ${A_OFF})`);
  sql(`delete from public.appointments where id in (${A}, ${A_OFF})`);
  sql(`delete from public.leads where id in (${L}, ${L_OFF})`);
  sql(`delete from public.projects where id in (${ON}, ${OFF})`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("reminder now");
