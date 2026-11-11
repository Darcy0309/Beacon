/**
 * Appointment reminder texts (client, Nov 2026), end to end: the template and its hour set in
 * Settings; the day before, at that hour, the database queues the next day's appointments on the
 * projects that have it on (not the others, not a cancelled one) and the app texts them from
 * Lighthouse's number (here, to a stand-in for Twilio), kept on the lead's Conversation; a number
 * that replied STOP is said so; never twice. The prospect answering Y or R tells the appointment's
 * manager (not the lead's rep); anything else is told as any reply is.
 *
 * Needs the app started with Twilio keys and:
 *   TWILIO_API_URL=http://127.0.0.1:4811     (the stand-in this test runs)
 *   PUSH_DELIVER_SECRET=<the local Vault's push_deliver_secret>
 * and TEST_TWILIO_ACCOUNT_SID, TEST_TWILIO_AUTH_TOKEN given here (the app's own). Skipped without them.
 */
import { createServer } from "node:http";
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { APP_URL } from "../support/env.mjs";
import { twilioSignature } from "../../src/lib/twilio-voice.js";

const ACCOUNT = process.env.TEST_TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TEST_TWILIO_AUTH_TOKEN;
if (!ACCOUNT || !TOKEN) {
  console.log("Skipped: give TEST_TWILIO_ACCOUNT_SID and TEST_TWILIO_AUTH_TOKEN (the app's own) to run the appointment text checks.");
  process.exit(0);
}
const SECRET = sql("select coalesce((select decrypted_secret from vault.decrypted_secrets where name='push_deliver_secret'), '')");
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n / 2))].map((b) => b.toString(16).padStart(2, "0")).join("");

// Twilio's Messages API, stood in for: what was asked for, and a number that replied STOP refused.
const asked = [];
const STOPPED = "+14805550199";
const twilio = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    const form = Object.fromEntries(new URLSearchParams(raw));
    asked.push({ path: req.url, form });
    res.setHeader("content-type", "application/json");
    if (form.To === STOPPED) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ code: 21610, message: "Attempt to send to unsubscribed recipient", status: 400 }));
    }
    res.statusCode = 201;
    res.end(JSON.stringify({ sid: `SM${hex(32)}`, status: "queued", from: "+15555550100" }));
  });
});
await new Promise((r) => twilio.listen(4811, "127.0.0.1", r));

const TAG = `APPTXT-E2E ${Date.now()}`;
const ADMIN = Number(sql("select id from public.users where email='admin@beacon.test'"));
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const MIKE = Number(sql("select id from public.users where email='mike@beacon.test'"));
const tail = String(Date.now()).slice(-4);
const MOBILE = `480556${tail}`;
const kept = sql("select coalesce((select value::text from public.app_settings where key = 'appt_texts'), '')");
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Capital Insurance`)}) returning id`));
const project = (on) => Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, contact_name, appt_texts)
  values (${lit(`${TAG} ${on ? "on" : "off"}`)}, ${company}, (select id from public.project_types where code='APPT'), 1, 'Bret Godsey', ${on}) returning id`));
const ON = project(true);
const OFF = project(false);
const lead = (proj, name, mobile) => Number(sql(`insert into public.leads (company_name, contact_name, phone, contact_mobile, project_id, assigned_user_id)
  values (${lit(`${TAG} ${name}`)}, 'Marco Ruiz', '602-555-0100', ${lit(mobile)}, ${proj}, ${SEAN}) returning id`));
const MARCO = lead(ON, "Coastline Auto", `(480) 556-${tail}`);
const STOPPER = lead(ON, "Desert Plumbing", "(480) 555-0199");
const QUIET = lead(OFF, "Self-Confirming Co", "(480) 557-0100");
const CANCELLED = lead(ON, "Cancelled Co", "(480) 558-0100");

// The clock the reminders go by, and "the day before at 10 AM" on it: ten days on, so the job the
// database runs every five minutes (for the real tomorrow) leaves these to the test.
const ZONE = "America/Phoenix";
const today = sql(`select (now() at time zone ${lit(ZONE)})::date + 10`);
const tomorrow = sql(`select (now() at time zone ${lit(ZONE)})::date + 11`);
const at = (hhmm) => sql(`select ((${lit(today)}::date + ${lit(hhmm)}::time) at time zone ${lit(ZONE)})::text`);
const appt = (leadId, proj, status = "Scheduled", rep = "Jen Carter") => Number(sql(`insert into public.appointments
  (lead_id, user_id, follow_up_user_id, project_id, set_stage, appt_date, appt_time, duration_min, rep_name, status_id, qa_status)
  values (${leadId}, ${SEAN}, ${MIKE}, ${proj}, 'appt', ${lit(tomorrow)}, '10:00 AM', 30, ${rep ? lit(rep) : "null"},
    (select id from public.appointment_statuses where name = ${lit(status)}), 'pending') returning id`));
const A_MARCO = appt(MARCO, ON);
const A_STOP = appt(STOPPER, ON, "Scheduled", null);
const A_QUIET = appt(QUIET, OFF);
const A_CANCELLED = appt(CANCELLED, ON, "Cancelled");

const queued = (id) => sql(`select count(*) from public.appointment_texts where appointment_id = ${id}`) === "1";
const send = () => fetch(`${APP_URL}/api/appointments/texts`, { method: "POST", headers: { "x-push-secret": SECRET } }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const hook = async (fields) => {
  const url = `${APP_URL}/api/twilio/sms`;
  const params = { AccountSid: ACCOUNT, To: "+15555550100", NumMedia: "0", MessageSid: `SM${hex(32)}`, ...fields };
  return (await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": twilioSignature(TOKEN, url, params) }, body: new URLSearchParams(params) })).status;
};
const notice = (user, like) => JSON.parse(sql(`select coalesce((select row_to_json(t)::text from (select title, body, link from public.notifications
  where user_id = ${user} and title like ${lit(like)} order by id desc limit 1) t), 'null')`) || "null");

const browser = await launchBrowser({ mouse: true });
try {
  section("Settings: the reminder and when it goes");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await admin.go("/settings", 7000);
  await until(() => admin.ev("!!document.querySelector('[data-appt-text-settings]')"), { timeout: 15000 });
  check("on Settings, with the projects that have it on counted", /projects? ha(s|ve) it on/.test(await admin.ev("document.querySelector('[data-appt-text-settings]').innerText")));
  const body = "Hi {first_name}, {client} here: reminder of your appointment with {agent_name} {appt_date} at {appt_time}. Reply Y to confirm, N to cancel, or R to reschedule.";
  await admin.fill("[data-appt-text-body]", body);
  await admin.fill("[data-appt-text-hour]", "10");
  await admin.fill("[data-appt-text-zone]", ZONE);
  await admin.ev("document.querySelector('[data-appt-text-settings] button[type=submit]').click()");
  const saved = await until(() => {
    const v = sql("select coalesce((select value::text from public.app_settings where key = 'appt_texts'), '')");
    return v && JSON.parse(v).body === body ? JSON.parse(v) : null;
  }, { timeout: 10000 });
  check("saved: the reminder, 10 AM, Arizona", saved?.hour === 10 && saved?.zone === ZONE, JSON.stringify(saved));

  section("The day before");
  sql(`select public.queue_appointment_texts(${lit(at("09:55"))}::timestamptz)`);
  check("before the hour: nothing queued", !queued(A_MARCO) && !queued(A_STOP));
  sql(`select public.queue_appointment_texts(${lit(at("10:05"))}::timestamptz)`);
  check("at the hour: tomorrow's appointments on a project with it on", queued(A_MARCO) && queued(A_STOP));
  check("…not one on a project with it off", !queued(A_QUIET));
  check("…nor a cancelled one", !queued(A_CANCELLED));

  const sent = await send();
  check("only the database can ask for them to go", (await fetch(`${APP_URL}/api/appointments/texts`, { method: "POST" })).status === 401);
  check("asked to send: they go", sent.status === 200, JSON.stringify(sent));
  const toMarco = await until(() => asked.find((a) => a.form.To === `+1${MOBILE}`) ?? null, { timeout: 10000 });
  check("Marco is texted, at his mobile, from Lighthouse's number", toMarco?.path?.endsWith("/Messages.json") && toMarco.form.From === "+15555550100", JSON.stringify(toMarco?.form));
  const tomorrowText = sql(`select trim(to_char(${lit(tomorrow)}::date, 'FMDay, FMMonth FMDD'))`);
  check("…the reminder filled in for his appointment", toMarco?.form.Body === `Hi Marco, ${TAG} Capital Insurance here: reminder of your appointment with Jen Carter ${tomorrowText} at 10:00 AM. Reply Y to confirm, N to cancel, or R to reschedule.`, toMarco?.form.Body);
  check("…and Twilio is to say how it went", toMarco?.form.StatusCallback?.endsWith("/api/twilio/sms?step=status"));
  const row = JSON.parse(sql(`select row_to_json(t)::text from (select x.sent_at is not null as sent, x.error, l.body, l.status, l.appointment_id, l.user_id
    from public.appointment_texts x join public.lead_texts l on l.id = x.text_id where x.appointment_id = ${A_MARCO}) t`) || "null");
  check("kept on his lead's Conversation, tied to the appointment", row?.sent && row.status === "queued" && row.appointment_id === A_MARCO && row.user_id === null && /reminder of your appointment/.test(row.body), JSON.stringify(row));
  const stop = JSON.parse(sql(`select row_to_json(t)::text from (select sent_at, error from public.appointment_texts where appointment_id = ${A_STOP}) t`) || "null");
  check("a number that replied STOP: not sent, and why", !stop?.sent_at && /replied STOP/.test(stop?.error ?? ""), JSON.stringify(stop));
  check("…its agent from the project when the appointment names none", (asked.find((a) => a.form.To === STOPPED)?.form.Body ?? "").includes("with Bret Godsey"));

  const before = asked.length;
  await send();
  sql(`select public.queue_appointment_texts(${lit(at("10:10"))}::timestamptz)`);
  await send();
  await sleep(500);
  check("never twice", asked.length === before, String(asked.length - before));

  section("The prospect answers");
  check("Y: taken", (await hook({ From: `+1${MOBILE}`, Body: "Yes!" })) === 200);
  const yes = await until(() => notice(MIKE, `Marco Ruiz replied Y%`), { timeout: 8000 });
  check("…the appointment's manager is told it's confirmed, with a link to the lead", /confirmed the appointment/.test(yes?.title ?? "") && /Mark it Confirmed/.test(yes?.body ?? "") && yes?.link === `/leads/${MARCO}?tab=conversation`, JSON.stringify(yes));
  check("…kept on the reminder", sql(`select reply from public.appointment_texts where appointment_id = ${A_MARCO}`) === "Y");
  check("…and the lead's rep isn't told it as a plain text", !notice(SEAN, `Text from ${TAG} Coastline Auto%`));
  check("the appointment itself is left for the manager to mark", sql(`select coalesce(s.name, '') from public.appointments a left join public.appointment_statuses s on s.id = a.status_id where a.id = ${A_MARCO}`) === "Scheduled");

  await hook({ From: `+1${MOBILE}`, Body: "r" });
  const re = await until(() => notice(MIKE, `Marco Ruiz replied R%`), { timeout: 8000 });
  check("R: the manager is told to call them", /wants to reschedule, call them/.test(re?.title ?? ""), JSON.stringify(re));
  check("…the latest answer kept", sql(`select reply from public.appointment_texts where appointment_id = ${A_MARCO}`) === "R");

  await hook({ From: `+1${MOBILE}`, Body: "Can Jen bring the quote?" });
  const other = await until(() => notice(SEAN, `Text from ${TAG} Coastline Auto%`), { timeout: 8000 });
  check("anything else: told as any reply is (the lead's rep)", /bring the quote/.test(other?.body ?? ""), JSON.stringify(other));

  section("On the Conversation");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await sean.go(`/leads/${MARCO}`, 7000);
  const thread = await until(() => sean.ev("document.querySelector('[data-conversation-thread]')?.innerText ?? null"), { timeout: 15000 });
  check("the reminder and the answers, in the thread", /reminder of your appointment/.test(thread ?? "") && /Yes!/.test(thread ?? "") && /Can Jen bring the quote/.test(thread ?? ""), thread);
} finally {
  browser.close();
  twilio.close();
  sql(kept ? `update public.app_settings set value = ${lit(kept)}::jsonb where key = 'appt_texts'` : "delete from public.app_settings where key = 'appt_texts'");
  sql(`delete from public.notifications where user_id in (${SEAN}, ${MIKE}, ${ADMIN}) and (title like ${lit(`%${TAG}%`)} or title like 'Marco Ruiz replied%')`);
  sql(`delete from public.leads where id in (${MARCO}, ${STOPPER}, ${QUIET}, ${CANCELLED})`);
  sql(`delete from public.projects where id in (${ON}, ${OFF})`);
  sql(`delete from public.companies where id = ${company}`);
}
finish("appointment texts");
