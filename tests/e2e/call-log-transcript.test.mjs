/**
 * Call Log: "Show transcription" (Nov 2026): a recorded call's transcript opens beneath it like a drop-down,
 * with its AI summary button, as on the lead's Conversation; a call not recorded has none.
 *
 *   node tests/run.mjs tests/e2e/call-log-transcript.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `CLT${Date.now()}`;
const tail = String(Date.now()).slice(-4);
const SEAN = Number(sql(`select id from public.users where email = 'sean@beacon.test'`));
const today = sql("select (now() at time zone public.business_tz())::date::text");
const project = Number(sql("select id from public.projects where deleted_at is null order by id limit 1"));
const NUMBER = `+1602558${tail}`;
const LEAD = Number(sql(`insert into public.leads (company_name, phone, project_id) values (${lit(`${TAG} Gardner Electric`)}, ${lit(NUMBER.slice(2))}, ${project}) returning id`));
const at = (hhmm) => `((${lit(today)}::date + time ${lit(hhmm)}) at time zone public.business_tz())`;
const call = (sid, hhmm, talk) => sql(`insert into public.phone_calls (call_sid, parent_sid, user_id, direction, number, status, started_at, rang_at, answered_at, ended_at, talk_seconds, lead_id)
  values (${lit(sid)}, ${lit(sid)}, ${SEAN}, 'out', ${lit(NUMBER)}, 'completed', ${at(hhmm)}, ${at(hhmm)}, ${at(hhmm)}, ${at(hhmm)} + interval '${talk} seconds', ${talk}, ${LEAD})`);
const RECORDED = `CA${TAG.toLowerCase()}0001`;
const PLAIN = `CA${TAG.toLowerCase()}0002`;
const REC = `RE${"a".repeat(19)}${String(Date.now()).slice(-13)}`;
call(RECORDED, "09:10", 73);
call(PLAIN, "09:30", 12);
const lines = [
  { side: 1, at: 0.5, text: "Hi, this is Sean with Signature Marketing." },
  { side: 2, at: 3.2, text: "Hi Sean, what can I do for you?" },
  { side: 1, at: 6.8, text: "Your package renews in March; can we look at it?" },
];
sql(`insert into public.phone_recordings (recording_sid, call_sid, user_id, number, seconds, lead_id, transcript_status, transcript)
  values (${lit(REC)}, ${lit(RECORDED)}, ${SEAN}, ${lit(NUMBER)}, 73, ${LEAD}, 'done', ${lit(JSON.stringify(lines))}::jsonb)`);

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 1000 });
  await admin.go(`/reports/calls?user=${SEAN}&from=${today}&to=${today}`, 6000);

  section("A recorded call");
  const row = await until(() => admin.ev(`document.querySelector('[data-call-transcript-row="${REC}"]')?.innerText ?? null`), { timeout: 15000 });
  check("beneath it: Show transcription, and AI summary", Boolean(row?.includes("Show transcription") && row.includes("AI summary")), row);
  check("…right under its call", await admin.ev(`document.querySelector('tr[data-call="${RECORDED}"]')?.nextElementSibling?.dataset.callTranscriptRow === ${JSON.stringify(REC)}`));
  check("…the transcript hidden to begin with", !(await admin.ev(`!!document.querySelector('[data-call-transcript-row="${REC}"] [data-call-transcript]')`)));
  await admin.click(`[data-call-transcript-row="${REC}"] [data-call-transcript-toggle]`);
  const shown = await until(() => admin.ev(`document.querySelector('[data-call-transcript-row="${REC}"] [data-call-transcript]')?.innerText ?? null`));
  check("Show transcription opens it: each line, who said it and when", Boolean(shown?.includes("Sean Fitzgerald: Hi, this is Sean") && shown.includes(`${TAG} Gardner Electric: Hi Sean`) && shown.includes("0:03")), shown);
  check("…and the button says Hide transcription", (await admin.ev(`document.querySelector('[data-call-transcript-row="${REC}"] [data-call-transcript-toggle]')?.textContent.trim()`)) === "Hide transcription");
  await admin.click(`[data-call-transcript-row="${REC}"] [data-call-transcript-toggle]`);
  check("…which closes it", Boolean(await until(async () => !(await admin.ev(`!!document.querySelector('[data-call-transcript-row="${REC}"] [data-call-transcript]')`)))));

  section("A call not recorded");
  check("no transcription under it", await admin.ev(`!document.querySelector('tr[data-call="${PLAIN}"]')?.nextElementSibling?.dataset.callTranscriptRow`));
} finally {
  browser.close();
  sql(`delete from public.phone_recordings where recording_sid = ${lit(REC)}`);
  sql(`delete from public.phone_calls where call_sid in (${lit(RECORDED)}, ${lit(PLAIN)})`);
  sql(`delete from public.leads where id = ${LEAD}`);
}

finish("call log transcript");
