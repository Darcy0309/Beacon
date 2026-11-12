/**
 * Call recordings (Nov 2026): Record pressed during a call, and when Twilio has the recording done it
 * says so (twilio/voice?step=recorded, signed): Lighthouse keeps it and tells the person who recorded
 * it, naming the other number and the lead, with a player on the notification. Only once, however
 * often Twilio says it; an unsigned one is turned away; only that person and administrators may play it.
 *
 * Needs the app started with Twilio keys, the Auth Token given here too:
 *   TWILIO_ACCOUNT_SID=AC… TWILIO_AUTH_TOKEN=… (and the other TWILIO_* keys, any values) for the app;
 *   TEST_TWILIO_ACCOUNT_SID, TEST_TWILIO_AUTH_TOKEN, the same two, for this test. Skipped without them.
 */
import { check, finish, section } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { cookieHeader, sessionCookies } from "../support/auth.mjs";
import { APP_URL } from "../support/env.mjs";
import { identityOf, twilioSignature } from "../../src/lib/twilio-voice.js";

const ACCOUNT = process.env.TEST_TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TEST_TWILIO_AUTH_TOKEN;
if (!ACCOUNT || !TOKEN) {
  console.log("Skipped: give TEST_TWILIO_ACCOUNT_SID and TEST_TWILIO_AUTH_TOKEN (the app's own) to run the call recording checks.");
  process.exit(0);
}

const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n / 2))].map((b) => b.toString(16).padStart(2, "0")).join("");
const TAG = `CR-INT ${Date.now()}`;
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const tail = String(Date.now()).slice(-4);
const DIGITS = `602555${tail}`;
const SHOWN = `+1 (602) 555-${tail}`;
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} DBDev`)}, ${company}, (select id from public.project_types where code='DBDV'), 1) returning id`));
// The same business, called for another client first (Sean, Nov 2026): nothing of this call is to be on it.
const twin = Number(sql(`insert into public.leads (company_name, contact_name, phone, project_id, assigned_user_id)
  values (${lit(`${TAG} Delta Door (other client)`)}, 'Dana Reyes', ${lit(`602-555-${tail}`)}, ${project}, ${SEAN}) returning id`));
const lead = Number(sql(`insert into public.leads (company_name, contact_name, phone, project_id, assigned_user_id)
  values (${lit(`${TAG} Delta Door`)}, 'Dana Reyes', ${lit(`602-555-${tail}`)}, ${project}, ${SEAN}) returning id`));
// The call out as Call Activity has it: the browser's call (the parent) and its leg to the number.
const PARENT = `CA${hex(32)}`;
const CHILD = `CA${hex(32)}`;
const REC = `RE${hex(32)}`;
sql(`insert into public.phone_calls (call_sid, parent_sid, user_id, direction, number, status, answered_at, ended_at, talk_seconds, lead_id)
  values (${lit(CHILD)}, ${lit(PARENT)}, ${SEAN}, 'out', ${lit(`+1${DIGITS}`)}, 'completed', now() - interval '1 minute', now(), 50, ${lead})`);

const hook = async (fields, { user = SEAN, sign = true, auto = false } = {}) => {
  const url = `${APP_URL}/api/twilio/voice?step=recorded&user=${user}${auto ? "&auto=1" : ""}`;
  const params = { AccountSid: ACCOUNT, ...fields };
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...(sign ? { "x-twilio-signature": twilioSignature(TOKEN, url, params) } : {}) },
    body: new URLSearchParams(params),
  });
  return res.status;
};
const done = { CallSid: PARENT, RecordingSid: REC, RecordingStatus: "completed", RecordingDuration: "42", RecordingChannels: "2" };
const notices = () => JSON.parse(sql(`select coalesce(json_agg(row_to_json(t)), '[]')::text from (select id, title, body, link from public.notifications where user_id = ${SEAN} and body like ${lit(`%${REC}%`)}) t`));

try {
  section("Twilio says a recording is done");
  check("an unsigned one is turned away", (await hook(done, { sign: false })) === 403);
  check("…and nothing is kept", Number(sql(`select count(*) from public.phone_recordings where recording_sid = ${lit(REC)}`)) === 0);
  check("a signed one is taken", (await hook(done)) === 204);
  const row = JSON.parse(sql(`select row_to_json(t)::text from (select call_sid, user_id, number, seconds, lead_id from public.phone_recordings where recording_sid = ${lit(REC)}) t`) || "null");
  check("kept: the call, whose, the number, how long, the lead it was called on (not the other with the number)", row?.call_sid === PARENT && row.user_id === SEAN && row.number === DIGITS && row.seconds === 42 && row.lead_id === lead, JSON.stringify(row));
  const [n] = notices();
  check("the person who recorded it is told, naming the number", n?.title === `Recorded call with ${SHOWN}`, JSON.stringify(n));
  check("…the lead, how long, where to listen", n?.body.startsWith(`${TAG} Delta Door · Dana Reyes\n0:42 long\nListen: `) && n.body.endsWith(`/api/phone/recordings/${REC}`) && n.link === `/leads/${lead}`, n?.body);
  await hook(done);
  check("told once, however often Twilio says it", notices().length === 1);
  check("a recording not done yet (or too short) tells no one", (await hook({ ...done, RecordingSid: `RE${hex(32)}`, RecordingStatus: "absent" })) === 204 &&
    (await hook({ ...done, RecordingSid: `RE${hex(32)}`, RecordingDuration: "0" })) === 204 &&
    Number(sql(`select count(*) from public.phone_recordings where call_sid = ${lit(PARENT)}`)) === 1);

  section("Its notification plays it");
  const seanJar = cookieHeader(await sessionCookies("sean@beacon.test"));
  const page = await (await fetch(`${APP_URL}/notifications/${n.id}`, { headers: { cookie: seanJar } })).text();
  check("the notification shows it as a call recording, with a player", /data-recording-kind="recording"/.test(page) && /data-recording-play/.test(page) && page.includes("Call recording"));

  section("Who may play it");
  const play = async (email) => (await fetch(`${APP_URL}/api/phone/recordings/${REC}`, { headers: { cookie: cookieHeader(await sessionCookies(email)) } })).status;
  const mine = await play("sean@beacon.test");
  check("the person who recorded it (sent on to Twilio)", mine !== 403 && mine !== 401, String(mine));
  const anAdmin = await play("admin@beacon.test");
  check("an administrator", anAdmin !== 403 && anAdmin !== 401, String(anAdmin));
  check("not someone else", (await play("agent@beacon.test")) === 403);

  section("Recorded by “Record every call” (Sean, Nov 2026)");
  const AUTO = `RE${hex(32)}`;
  check("Twilio says it is done: taken", (await hook({ ...done, RecordingSid: AUTO }, { auto: true })) === 204);
  check("…kept like any other, on the call", sql(`select call_sid from public.phone_recordings where recording_sid = ${lit(AUTO)}`) === PARENT);
  check("…without a notification for every call", Number(sql(`select count(*) from public.notifications where user_id = ${SEAN} and body like ${lit(`%${AUTO}%`)}`)) === 0);

  section("Record every call: what Twilio is told to do");
  const twiml = async (step, fields) => {
    const url = `${APP_URL}/api/twilio/voice${step ? `?step=${step}` : ""}`;
    const params = { AccountSid: ACCOUNT, CallSid: `CA${hex(32)}`, ...fields };
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": twilioSignature(TOKEN, url, params) }, body: new URLSearchParams(params) });
    return res.text();
  };
  const out = () => twiml(null, { From: `client:${identityOf(SEAN)}`, To: `+1${DIGITS}` });
  const callIn = () => twiml(null, { From: `+1${DIGITS}`, To: process.env.TWILIO_CALLER_ID ?? "+15555550100", Direction: "inbound" });
  const setting = (value) => sql(value === null ? "delete from public.app_settings where key = 'phone'"
    : `insert into public.app_settings (key, value) values ('phone', ${lit(JSON.stringify(value))}::jsonb) on conflict (key) do update set value = excluded.value`);
  const before = sql("select value::text from public.app_settings where key = 'phone'") || null;
  const present = sql(`select count(*) from public.phone_presence where user_id = ${SEAN}`) !== "0";
  sql(`insert into public.phone_presence (user_id, seen_at) values (${SEAN}, now()) on conflict (user_id) do update set seen_at = now()`);
  try {
    setting({ record_all: false });
    check("off: a call out is put straight through, nothing said", !/step=notice/.test(await out()) && /<Dial/.test(await out()));
    check("…a call in rings, nothing said", !/may be recorded/.test(await callIn()));
    setting({ record_all: true, record_notice: true });
    const o = await out();
    check("on, with the notice: the person called hears it as they answer", /<Number[^>]* url="[^"]*step=notice"/.test(o), o);
    check("…and a caller before it rings", /<Say[^>]*>This call may be recorded\.<\/Say><Dial/.test(await callIn()), await callIn());
    check("the notice itself", /<Say[^>]*>This call may be recorded\.<\/Say>/.test(await twiml("notice", { From: `+1${DIGITS}`, To: `+1${DIGITS}` })));
    const jar = cookieHeader(await sessionCookies("sean@beacon.test"));
    check("the phone is told, with its calling token", (await (await fetch(`${APP_URL}/api/phone/token`, { headers: { cookie: jar } })).json())?.recordAll === true);
    setting({ record_all: true, record_notice: false });
    check("on, without the notice: nothing said", !/step=notice/.test(await out()) && !/may be recorded/.test(await callIn()));
    setting({ record_all: false });
    check("off: the phone is told so", (await (await fetch(`${APP_URL}/api/phone/token`, { headers: { cookie: jar } })).json())?.recordAll === false);
  } finally {
    setting(before ? JSON.parse(before) : null);
    if (!present) sql(`delete from public.phone_presence where user_id = ${SEAN}`);
  }

  section("Each call on the lead it was made from (Sean, Nov 2026)");
  {
    const LEG = `CA${hex(32)}`;
    const url = `${APP_URL}/api/twilio/voice?step=status&dir=out&user=${SEAN}&lead=${lead}`;
    const params = { AccountSid: ACCOUNT, CallSid: LEG, ParentCallSid: `CA${hex(32)}`, To: `+1${DIGITS}`, CallStatus: "ringing" };
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": twilioSignature(TOKEN, url, params) }, body: new URLSearchParams(params) });
    check("a call out keeps the lead the phone sent with it", res.status === 204 && Number(sql(`select lead_id from public.phone_calls where call_sid = ${lit(LEG)}`)) === lead, res.status);
    const IN = `CA${hex(32)}`;
    sql(`select public.phone_call_event(${lit(IN)}, ${lit(IN)}, null, 'in', ${lit(`+1${DIGITS}`)}, 'no-answer', 0)`);
    check("a call in from that number: on the lead last called on it, not the other", Number(sql(`select lead_id from public.phone_calls where call_sid = ${lit(IN)}`)) === lead);
    sql(`delete from public.phone_calls where call_sid in (${lit(LEG)}, ${lit(IN)})`);
  }
} finally {
  sql(`delete from public.notifications where user_id = ${SEAN} and body like ${lit(`%${REC}%`)}`);
  sql(`delete from public.phone_recordings where call_sid = ${lit(PARENT)}`);
  sql(`delete from public.phone_calls where call_sid = ${lit(CHILD)}`);
  sql(`delete from public.activity_log where entity = 'lead' and entity_id = ${lead}`);
  sql(`delete from public.leads where id in (${lead}, ${twin})`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("call recordings");
