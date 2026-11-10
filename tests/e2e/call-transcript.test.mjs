/**
 * A recorded call's transcript (client, Nov 2026), end to end in a real browser, with a stand-in for
 * Twilio's Conversational Intelligence run by this test: a recording done is sent to be transcribed
 * (each side named); the Conversation says so; Twilio's "ready" (which it doesn't sign) is only a
 * nudge, so an unknown transcript does nothing; a ready one is read and kept as lines, shown on the
 * open Conversation on request; and a transcript whose "ready" never came is caught up on when the
 * lead is looked at.
 *
 * Needs the app started with Twilio keys and:
 *   TWILIO_INTELLIGENCE_SERVICE_SID=GA00000000000000000000000000000000  TWILIO_INTELLIGENCE_URL=http://127.0.0.1:4810
 * and the Account SID and Auth Token given here: TEST_TWILIO_ACCOUNT_SID, TEST_TWILIO_AUTH_TOKEN. Skipped without them.
 */
import { createServer } from "node:http";
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { APP_URL } from "../support/env.mjs";
import { twilioSignature } from "../../src/lib/twilio-voice.js";

const ACCOUNT = process.env.TEST_TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TEST_TWILIO_AUTH_TOKEN;
const PORT = Number(process.env.TEST_AI_PORT ?? 4810);
if (!ACCOUNT || !TOKEN) {
  console.log("Skipped: give TEST_TWILIO_ACCOUNT_SID and TEST_TWILIO_AUTH_TOKEN (the app's own), with the app pointed at the stand-in (see the top of this file).");
  process.exit(0);
}

const SHOTS = process.env.SHOTS;
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n / 2))].map((b) => b.toString(16).padStart(2, "0")).join("");
// The stand-in: Twilio's transcripts (created queued; completed when the test says).
const transcripts = new Map(); // GT… → { status, form }
const asked = { transcripts: [], reads: [] };
const stand = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const url = new URL(req.url, "http://x");
  const json = (code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  if (req.method === "POST" && url.pathname === "/v2/Transcripts") {
    const form = Object.fromEntries(new URLSearchParams(raw));
    const sid = `GT${hex(32)}`;
    transcripts.set(sid, { status: "queued", form });
    asked.transcripts.push({ sid, form, auth: req.headers.authorization });
    return json(201, { sid, status: "queued" });
  }
  const one = /^\/v2\/Transcripts\/(GT[0-9a-f]{32})(\/Sentences)?$/.exec(url.pathname);
  if (req.method === "GET" && one) {
    asked.reads.push(url.pathname);
    const t = transcripts.get(one[1]);
    if (!t) return json(404, { message: "Not found" });
    if (!one[2]) return json(200, { sid: one[1], status: t.status, customer_key: t.form.CustomerKey });
    return json(200, {
      sentences: [
        { sentence_index: 0, media_channel: 1, start_time: "0.6", transcript: "Hi, this is Sean with Signature Marketing." },
        { sentence_index: 1, media_channel: 2, start_time: "3.2", transcript: "Hey Sean, Marco here." },
        { sentence_index: 2, media_channel: 1, start_time: "5.0", transcript: "When does your policy renew?" },
        { sentence_index: 3, media_channel: 2, start_time: "7.4", transcript: "March. Send me pricing and come by Friday at ten." },
      ],
      meta: { next_page_url: null },
    });
  }
  json(404, { message: `No stand-in for ${req.method} ${url.pathname}` });
});
await new Promise((ok) => stand.listen(PORT, "127.0.0.1", ok));

const TAG = `CT-E2E ${Date.now()}`;
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const tail = String(Date.now()).slice(-4);
const MOBILE = `480555${tail}`;
const lead = Number(sql(`insert into public.leads (company_name, contact_name, contact_mobile, assigned_user_id)
  values (${lit(`${TAG} Coastline Auto`)}, 'Marco Ruiz', ${lit(`(480) 555-${tail}`)}, ${SEAN}) returning id`));
const call = () => {
  const parent = `CA${hex(32)}`;
  sql(`insert into public.phone_calls (call_sid, parent_sid, user_id, direction, number, status, answered_at, ended_at, talk_seconds)
    values (${lit(`CA${hex(32)}`)}, ${lit(parent)}, ${SEAN}, 'out', '+1${MOBILE}', 'completed', now() - interval '2 minutes', now(), 95)`);
  return parent;
};
const PARENTS = [call(), call()];
const RECS = [`RE${hex(32)}`, `RE${hex(32)}`];

const recorded = async (parent, rec) => {
  const url = `${APP_URL}/api/twilio/voice?step=recorded&user=${SEAN}`;
  const params = { AccountSid: ACCOUNT, CallSid: parent, RecordingSid: rec, RecordingStatus: "completed", RecordingDuration: "95" };
  return (await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": twilioSignature(TOKEN, url, params) }, body: new URLSearchParams(params) })).status;
};
const nudge = (sid, json = true) => fetch(`${APP_URL}/api/twilio/intelligence`, {
  method: "POST",
  headers: { "content-type": json ? "application/json" : "application/x-www-form-urlencoded" },
  body: json ? JSON.stringify({ transcript_sid: sid, event_type: "voice_intelligence_transcript_available" }) : new URLSearchParams({ transcript_sid: sid }),
}).then((r) => r.status);
const row = (rec) => JSON.parse(sql(`select row_to_json(t)::text from (select transcript_status, transcript_error, transcript_sid, transcript from public.phone_recordings where recording_sid = ${lit(rec)}) t`) || "null");

const browser = await launchBrowser({ mouse: true });
const when = (page, expr, timeout = 20000) => until(() => page.ev(expr), { timeout });

try {
  section("A recording done is sent to be transcribed");
  check("the recording taken", (await recorded(PARENTS[0], RECS[0])) === 204);
  const sent = await until(() => asked.transcripts.find((t) => t.form.CustomerKey === RECS[0]) ?? null, { timeout: 15000 });
  const channel = JSON.parse(sent?.form.Channel ?? "{}");
  check("to the Intelligence Service, for this recording", sent?.form.ServiceSid === "GA00000000000000000000000000000000" && channel.media_properties?.source_sid === RECS[0], JSON.stringify(sent?.form));
  check("…ours on channel 1, named; theirs on 2", channel.participants?.[0]?.channel_participant === 1 && channel.participants[0].full_name === "Sean Fitzgerald" && channel.participants[1]?.role === "Customer", JSON.stringify(channel.participants));
  check("…with the account's own login", sent?.auth === `Basic ${Buffer.from(`${ACCOUNT}:${TOKEN}`).toString("base64")}`);
  const first = await until(() => (row(RECS[0])?.transcript_status === "transcribing" ? row(RECS[0]) : null), { timeout: 10000 });
  check("kept as transcribing, with Twilio's transcript", first?.transcript_sid === sent?.sid, JSON.stringify(first));

  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await sean.go(`/leads/${lead}?tab=conversation`, 7000);
  check("the Conversation says it's being transcribed", Boolean(await when(sean, "!!document.querySelector('[data-call-transcript-status=\"transcribing\"]')")));

  section("Twilio's \"ready\" is only a nudge");
  const reads = asked.reads.length;
  check("an unknown transcript does nothing", (await nudge(`GT${hex(32)}`)) === 204);
  await nudge(sent.sid); // not finished yet at Twilio: read, and left
  await sleep(1500);
  check("…nor does one Twilio hasn't finished", row(RECS[0]).transcript_status === "transcribing" && asked.reads.length === reads + 1, String(asked.reads.length - reads));

  section("Ready: kept");
  transcripts.get(sent.sid).status = "completed";
  check("the nudge taken (as a form too)", (await nudge(sent.sid, false)) === 204);
  const done = await until(() => (row(RECS[0])?.transcript_status === "done" ? row(RECS[0]) : null), { timeout: 20000 });
  check("the transcript kept as lines, one a turn, each side", JSON.stringify(done?.transcript?.map((l) => [l.side, l.at])) === JSON.stringify([[1, 0.6], [2, 3.2], [1, 5], [2, 7.4]]), JSON.stringify(done?.transcript));
  check("…and no error", done?.transcript_error === null, JSON.stringify(done));

  check("the Conversation offers it by itself", Boolean(await when(sean, "!!document.querySelector('[data-call-transcript-toggle]')", 30000)));
  await sean.click("[data-call-transcript-toggle]");
  const transcript = await when(sean, "document.querySelector('[data-call-transcript]')?.innerText");
  check("the transcript on request, each side named", /0:00\s*Sean Fitzgerald: Hi, this is Sean/.test(transcript ?? "") && /0:07\s*Marco Ruiz: March\./.test(transcript ?? ""), transcript);
  check("no summary: only the transcript", !(await sean.ev("!!document.querySelector('[data-call-summary]')")));
  if (SHOTS) await sean.screenshot(`${SHOTS}/call-transcript.png`);

  section("A \"ready\" that never came");
  await recorded(PARENTS[1], RECS[1]);
  const second = await until(() => asked.transcripts.find((t) => t.form.CustomerKey === RECS[1]) ?? null, { timeout: 15000 });
  await until(() => row(RECS[1])?.transcript_status === "transcribing", { timeout: 10000 });
  transcripts.get(second.sid).status = "completed";
  sql(`update public.phone_recordings set transcript_updated_at = now() - interval '2 minutes' where recording_sid = ${lit(RECS[1])}`);
  await sean.go(`/leads/${lead}?tab=conversation`, 5000);
  const caught = await until(() => (row(RECS[1])?.transcript_status === "done" ? row(RECS[1]) : null), { timeout: 20000 });
  check("caught up on when the lead is looked at", caught?.transcript?.length === 4, JSON.stringify(caught));
} finally {
  browser.close();
  stand.close();
  sql(`delete from public.notifications where user_id = ${SEAN} and body like ${lit(`%${TAG}%`)}`);
  for (const r of RECS) sql(`delete from public.notifications where body like ${lit(`%${r}%`)}`);
  sql(`delete from public.phone_recordings where recording_sid in (${RECS.map(lit).join(", ")})`);
  sql(`delete from public.phone_calls where parent_sid in (${PARENTS.map(lit).join(", ")})`);
  sql(`delete from public.activity_log where entity = 'lead' and entity_id = ${lead}`);
  sql(`delete from public.leads where id = ${lead}`);
}

finish("call transcript");
