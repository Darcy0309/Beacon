/**
 * The phone lines (Sean, Nov 2026), as Twilio meets them: the voice webhook answered with signed requests.
 *
 *   The managers' line   its greeting, waiting for an extension; an extension rings that manager (where they have
 *                        the phone open), then their voicemail: their own recording, their words in the AI voice,
 *                        or the usual greeting with their name; a wrong one gets one more try; none dialed, the
 *                        general voicemail, whose notice goes to the people chosen for it, not the administrators
 *   A chosen people line rings them (Signature Marketing: Sean and Mike), then their voicemail
 *   A local caller ID    called back: rings the manager who last called that number
 *   Calls out            go out from the local line in the project's area code, or the one picked in the phone
 *   A voicemail          plays for the people it was left for
 *
 * Needs the app started with stand-in Twilio keys (calls never reach Twilio):
 *   TWILIO_ACCOUNT_SID=AC11111111111111111111111111111111 TWILIO_AUTH_TOKEN=phone-lines-test-token
 *   TWILIO_API_KEY=SK11111111111111111111111111111111 TWILIO_API_SECRET=secret
 *   TWILIO_TWIML_APP_SID=AP11111111111111111111111111111111 TWILIO_CALLER_ID=+16025550199
 * Removes what it made.
 *
 *   node tests/e2e/phone-lines.test.mjs
 */
import { check, finish, section } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { APP_URL, SERVICE_ROLE_KEY, SUPABASE_URL } from "../support/env.mjs";
import { twilioSignature } from "../../src/lib/twilio-voice.js";

const ACCOUNT = process.env.TEST_TWILIO_ACCOUNT_SID ?? "AC11111111111111111111111111111111";
const TOKEN = process.env.TEST_TWILIO_AUTH_TOKEN ?? "phone-lines-test-token";
const DARCY = 1, SEAN = 2, MIKE = 3, RACHEL = 4;
const ATTENDANT = "+18885550101", MAIN = "+18885550102", LOCAL = "+17155550103";
const TAG = `PL-TEST ${Date.now()}`;
const CALL = () => `CA${[...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
// The voicemails it leaves, to take their notices off after.
const recs = [];
const REC = () => {
  const sid = `RE${[...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  recs.push(sid);
  return sid;
};

/** Ask the webhook as Twilio does: signed with the account's Auth Token. */
async function twilio(query, params) {
  const url = `${APP_URL}/api/twilio/voice${query}`;
  const body = { AccountSid: ACCOUNT, ...params };
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": twilioSignature(TOKEN, url, body) }, body: new URLSearchParams(body) });
  return { status: res.status, text: await res.text() };
}

const before = sql(`select coalesce(value::text, '') from public.app_settings where key = 'phone'`);
const exts = sql(`select coalesce(json_agg(json_build_object('id', id, 'ext', phone_ext, 'g', voicemail_greeting, 'p', voicemail_audio_path, 'r', voicemail_use_recording)), '[]') from public.users where id in (${SEAN}, ${MIKE}, ${RACHEL})`);
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Co`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, phone) values (${lit(`${TAG} Appts`)}, ${company},
  (select id from public.project_types where code = 'APPT'), 1, '(715) 834-2200') returning id`));
const lead = Number(sql(`insert into public.leads (company_name, project_id, stage, phone) values (${lit(`${TAG} Lead`)}, ${project}, 'appt', '715-555-7777') returning id`));
const greetingPath = `${RACHEL}/${Date.now()}.wav`;

try {
  // The lines; Sean x7101 and Mike x7102, Rachel x7103 with her own recording; the general voicemail to Mike.
  sql(`delete from public.phone_lines where number in ('${ATTENDANT}', '${MAIN}', '${LOCAL}')`);
  sql(`insert into public.phone_lines (number, kind, label) values ('${ATTENDANT}', 'attendant', 'Managers')`);
  const mainId = Number(sql(`insert into public.phone_lines (number, kind, label, ring_user_ids) values ('${MAIN}', 'main', 'Signature Marketing', array[${SEAN}, ${MIKE}]::bigint[]) returning id`));
  sql(`insert into public.phone_lines (number, kind, label) values ('${LOCAL}', 'local', 'Eau Claire, WI')`);
  sql(`update public.users set phone_ext = null where phone_ext in ('7101', '7102', '7103')`);
  sql(`update public.users set phone_ext = '7101', voicemail_greeting = null, voicemail_use_recording = false where id = ${SEAN}`);
  sql(`update public.users set phone_ext = '7102', voicemail_greeting = 'Mike here, leave it at the beep.', voicemail_use_recording = false where id = ${MIKE}`);
  sql(`update public.users set phone_ext = '7103', voicemail_audio_path = ${lit(greetingPath)}, voicemail_use_recording = true where id = ${RACHEL}`);
  sql(`insert into public.app_settings (key, value) values ('phone', jsonb_build_object('general_voicemail_users', jsonb_build_array(${MIKE})))
    on conflict (key) do update set value = coalesce(public.app_settings.value, '{}'::jsonb) || jsonb_build_object('general_voicemail_users', jsonb_build_array(${MIKE}), 'attendant_greeting', null)`);
  // Sean has the phone open; Mike and Rachel don't.
  sql(`delete from public.phone_presence where user_id in (${SEAN}, ${MIKE}, ${RACHEL})`);
  sql(`insert into public.phone_presence (user_id, seen_at) values (${SEAN}, now())`);
  // Rachel's own greeting, a WAV in the bucket.
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/voicemail-greetings/${greetingPath}`, {
    method: "POST", headers: { authorization: `Bearer ${SERVICE_ROLE_KEY}`, "content-type": "audio/wav" }, body: new Uint8Array(64) });
  if (!up.ok) throw new Error(`greeting upload: ${up.status} ${await up.text()}`);

  section("The managers' line");
  const first = await twilio("", { CallSid: CALL(), From: "+14145550001", To: ATTENDANT });
  if (first.status === 503) throw new Error("Start the app with the stand-in Twilio keys (see the top of this file).");
  check("answers with the insurance office greeting, waiting for an extension", /<Gather[^>]*action="\/api\/twilio\/voice\?step=ext"/.test(first.text) && /Thank you for calling the insurance office/.test(first.text), first.text);
  check("…in the AI voice", /voice="Polly\.Joanna-Neural"/.test(first.text));
  const sean = await twilio("?step=ext", { CallSid: CALL(), From: "+14145550001", To: ATTENDANT, Digits: "7101" });
  check("an extension rings that manager where they have the phone open", sean.text.includes(`<Client`) && sean.text.includes(">lh_2</Client>") && /timeout="30"/.test(sean.text)
    && sean.text.includes("step=after&amp;box=user-2"), sean.text);
  const mike = await twilio("?step=ext", { CallSid: CALL(), From: "+14145550001", To: ATTENDANT, Digits: "7102" });
  check("…not there: straight to their voicemail, their words in the AI voice", mike.text.includes("Mike here, leave it at the beep.") && /<Record[^>]*box=user-3/.test(mike.text), mike.text);
  const missed = await twilio("?step=after&box=user-2", { CallSid: CALL(), From: "+14145550001", To: ATTENDANT, DialCallStatus: "no-answer" });
  check("…unanswered: their voicemail, the usual greeting with their name", missed.text.includes("You&apos;ve reached Sean.") && /<Record[^>]*box=user-2/.test(missed.text), missed.text);
  const rachel = await twilio("?step=ext", { CallSid: CALL(), From: "+14145550001", To: ATTENDANT, Digits: "7103" });
  check("…their own recording, played", /<Play>https?:\/\/[^<]*voicemail-greetings[^<]*<\/Play>/.test(rachel.text), rachel.text);
  const wrong = await twilio("?step=ext", { CallSid: CALL(), From: "+14145550001", To: ATTENDANT, Digits: "9999" });
  check("a wrong extension: said so, and one more try", wrong.text.includes("that extension is not in service") && wrong.text.includes("step=ext&amp;try=2"), wrong.text);
  const wrongAgain = await twilio("?step=ext&try=2", { CallSid: CALL(), From: "+14145550001", To: ATTENDANT, Digits: "9999" });
  check("…wrong again: the general voicemail", /<Record[^>]*box=general/.test(wrongAgain.text), wrongAgain.text);
  const none = await twilio("?step=ext", { CallSid: CALL(), From: "+14145550001", To: ATTENDANT, Digits: "" });
  check("no extension dialed: the general voicemail", /<Record[^>]*box=general/.test(none.text) && none.text.includes("Sorry, no one can take your call"), none.text);

  section("The general voicemail goes to the people chosen, not the administrators");
  const sid = REC();
  const left = await twilio("?step=left&box=general", { CallSid: CALL(), From: "+14145550001", To: ATTENDANT, RecordingSid: sid, RecordingDuration: "12" });
  const told = (who) => Number(sql(`select count(*) from public.notifications where user_id = ${who} and body like ${lit(`%${sid}%`)}`));
  check("Mike is told, with the voicemail to play", left.status === 200 && told(MIKE) === 1 && sql(`select count(*) from public.phone_voicemail_access where recording_sid = '${sid}' and user_id = ${MIKE}`) === "1",
    `${left.status} mike=${told(MIKE)}`);
  check("…titled General voicemail", sql(`select title from public.notifications where user_id = ${MIKE} and body like ${lit(`%${sid}%`)}`).startsWith("General voicemail from"));
  check("…and the administrators aren't", told(DARCY) === 0);
  const own = REC();
  await twilio("?step=left&box=user-3", { CallSid: CALL(), From: "+14145550001", To: ATTENDANT, RecordingSid: own, RecordingDuration: "9" });
  check("a manager's voicemail: to them alone", Number(sql(`select count(*) from public.notifications where body like ${lit(`%${own}%`)}`)) === 1
    && Number(sql(`select count(*) from public.notifications where user_id = ${MIKE} and body like ${lit(`%${own}%`)}`)) === 1);

  section("A line for chosen people (Signature Marketing)");
  const main = await twilio("", { CallSid: CALL(), From: "+14145550002", To: MAIN });
  check("rings those of them with the phone open", main.text.includes(">lh_2</Client>") && !main.text.includes(">lh_3</Client>") && main.text.includes(`box=line-${mainId}`), main.text);
  sql(`delete from public.phone_presence where user_id = ${SEAN}`);
  const mainNone = await twilio("", { CallSid: CALL(), From: "+14145550002", To: MAIN });
  check("…nobody there: its voicemail, which goes to them", new RegExp(`<Record[^>]*box=line-${mainId}`).test(mainNone.text), mainNone.text);
  const lineVm = REC();
  await twilio(`?step=left&box=line-${mainId}`, { CallSid: CALL(), From: "+14145550002", To: MAIN, RecordingSid: lineVm, RecordingDuration: "5" });
  check("…to Sean and Mike", sql(`select string_agg(user_id::text, ',' order by user_id) from public.notifications where body like ${lit(`%${lineVm}%`)}`) === `${SEAN},${MIKE}`);
  sql(`insert into public.phone_presence (user_id, seen_at) values (${SEAN}, now()) on conflict (user_id) do update set seen_at = now()`);

  section("Local caller IDs");
  const out = await twilio("", { CallSid: CALL(), From: `client:lh_${SEAN}`, To: "+17155557777", Lead: String(lead) });
  check("a call from a lead goes out from the local line in its project's area code", out.text.includes(`callerId="${LOCAL}"`), out.text);
  const picked = await twilio("", { CallSid: CALL(), From: `client:lh_${SEAN}`, To: "+17155557777", Lead: String(lead), CallerId: ATTENDANT });
  check("…or the one picked in the phone", picked.text.includes(`callerId="${ATTENDANT}"`), picked.text);
  const bogus = await twilio("", { CallSid: CALL(), From: `client:lh_${SEAN}`, To: "+17155557777", Lead: String(lead), CallerId: "+13125550100" });
  check("…never a number that isn't ours", bogus.text.includes(`callerId="${LOCAL}"`), bogus.text);
  const plain = await twilio("", { CallSid: CALL(), From: `client:lh_${SEAN}`, To: "+14145559999" });
  check("…a call from no lead: the company's number", plain.text.includes(`callerId="+16025550199"`), plain.text);
  sql(`insert into public.phone_calls (call_sid, user_id, direction, number, status, started_at) values ('${CALL()}', ${SEAN}, 'out', '+17155557777', 'completed', now())`);
  const back = await twilio("", { CallSid: CALL(), From: "+17155557777", To: LOCAL });
  check("called back on it: rings the manager who last called that number", back.text.includes(">lh_2</Client>") && back.text.includes("box=user-2"), back.text);
  const stranger = await twilio("", { CallSid: CALL(), From: "+19205550000", To: LOCAL });
  check("…a number nobody called: the managers' greeting", /<Gather[^>]*step=ext/.test(stranger.text), stranger.text);

  section("Who may play a voicemail");
  const browser = await launchBrowser();
  try {
    const status = async (as) => {
      const page = await (await browser.newContext({ as })).newPage();
      await page.go("/security", 4000);
      return page.ev(`fetch('/api/phone/recordings/${sid}').then((r) => r.status)`);
    };
    check("the person it was left for gets past the check", (await status("mike@beacon.test")) !== 403);
    check("…another manager doesn't", (await status("rachel@beacon.test")) === 403);
  } finally {
    browser.close();
  }
} finally {
  {
    for (const r of recs) {
      sql(`delete from public.phone_voicemail_access where recording_sid = '${r}'`);
      sql(`delete from public.notifications where body like ${lit(`%${r}%`)}`);
    }
    sql(`delete from public.phone_calls where number in ('+17155557777', '+14145550001', '+14145550002', '+19205550000', '+14145559999') or call_sid in (select call_sid from public.phone_calls where number like 'client:%' and started_at > now() - interval '15 minutes')`);
    sql(`delete from public.phone_lines where number in ('${ATTENDANT}', '${MAIN}', '${LOCAL}')`);
    for (const u of JSON.parse(exts)) {
      sql(`update public.users set phone_ext = ${u.ext ? lit(u.ext) : "null"}, voicemail_greeting = ${u.g ? lit(u.g) : "null"},
        voicemail_audio_path = ${u.p ? lit(u.p) : "null"}, voicemail_use_recording = ${u.r ? "true" : "false"} where id = ${u.id}`);
    }
    if (before) sql(`update public.app_settings set value = ${lit(before)}::jsonb where key = 'phone'`);
    else sql(`delete from public.app_settings where key = 'phone'`);
    sql(`delete from public.phone_presence where user_id in (${SEAN}, ${MIKE}, ${RACHEL})`);
    await fetch(`${SUPABASE_URL}/storage/v1/object/voicemail-greetings/${greetingPath}`, { method: "DELETE", headers: { authorization: `Bearer ${SERVICE_ROLE_KEY}` } }).catch(() => {});
    sql(`delete from public.leads where id = ${lead}`);
    sql(`delete from public.projects where id = ${project}`);
    sql(`delete from public.companies where id = ${company}`);
  }
}
finish("phone lines");
