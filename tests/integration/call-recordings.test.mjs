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
import { twilioSignature } from "../../src/lib/twilio-voice.js";

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
const lead = Number(sql(`insert into public.leads (company_name, contact_name, phone, project_id, assigned_user_id)
  values (${lit(`${TAG} Delta Door`)}, 'Dana Reyes', ${lit(`602-555-${tail}`)}, ${project}, ${SEAN}) returning id`));
// The call out as Call Activity has it: the browser's call (the parent) and its leg to the number.
const PARENT = `CA${hex(32)}`;
const CHILD = `CA${hex(32)}`;
const REC = `RE${hex(32)}`;
sql(`insert into public.phone_calls (call_sid, parent_sid, user_id, direction, number, status, answered_at, ended_at, talk_seconds)
  values (${lit(CHILD)}, ${lit(PARENT)}, ${SEAN}, 'out', ${lit(`+1${DIGITS}`)}, 'completed', now() - interval '1 minute', now(), 50)`);

const hook = async (fields, { user = SEAN, sign = true } = {}) => {
  const url = `${APP_URL}/api/twilio/voice?step=recorded&user=${user}`;
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
  check("kept: the call, whose, the number, how long, the lead", row?.call_sid === PARENT && row.user_id === SEAN && row.number === DIGITS && row.seconds === 42 && row.lead_id === lead, JSON.stringify(row));
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
} finally {
  sql(`delete from public.notifications where user_id = ${SEAN} and body like ${lit(`%${REC}%`)}`);
  sql(`delete from public.phone_recordings where call_sid = ${lit(PARENT)}`);
  sql(`delete from public.phone_calls where call_sid = ${lit(CHILD)}`);
  sql(`delete from public.activity_log where entity = 'lead' and entity_id = ${lead}`);
  sql(`delete from public.leads where id = ${lead}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("call recordings");
