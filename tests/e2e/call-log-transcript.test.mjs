/**
 * Call Log: round "Show transcription" and "AI summary" buttons beside a recorded call's player (Nov 2026);
 * the transcription opens in a panel above its button and closes on a second press or its X; a call not recorded has none.
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
  const buttons = await until(() => admin.ev(`(() => { const box = document.querySelector('tr[data-call="${RECORDED}"] [data-call-recording="${REC}"]'); return box ? [...box.querySelectorAll('button[aria-label]')].map((b) => b.getAttribute('aria-label')) : null; })()`), { timeout: 15000 });
  check("beside its player: round Show transcription and AI summary buttons", JSON.stringify(buttons?.slice(-2)) === JSON.stringify(["Show transcription", "AI summary"]), JSON.stringify(buttons));
  check("…nothing open to begin with", !(await admin.ev(`!!document.querySelector('[data-call-panel]')`)));
  await admin.click(`[data-call-recording="${REC}"] [data-call-transcript-toggle]`);
  const shown = await until(() => admin.ev(`document.querySelector('[data-call-panel="transcript"] [data-call-transcript]')?.innerText ?? null`));
  check("Show transcription opens it in a panel: each line, who said it and when", Boolean(shown?.includes("Sean Fitzgerald: Hi, this is Sean") && shown.includes(`${TAG} Gardner Electric: Hi Sean`) && shown.includes("0:03")), shown);
  const place = await admin.ev(`(() => { const p = document.querySelector('[data-call-panel="transcript"]').getBoundingClientRect(); const b = document.querySelector('[data-call-recording="${REC}"] [data-call-transcript-toggle]').getBoundingClientRect(); return { above: p.bottom <= b.top + 1, rightEdge: Math.round(p.right - b.right) }; })()`);
  check("…above its button, lined up with its right edge", place?.above && Math.abs(place.rightEdge) <= 2, JSON.stringify(place));
  check("…no row opened in the table", !(await admin.ev(`!!document.querySelector('[data-call-transcript-row]')`)));
  check("…the button now Hide transcription", (await admin.ev(`document.querySelector('[data-call-recording="${REC}"] [data-call-transcript-toggle]')?.getAttribute('aria-label')`)) === "Hide transcription");
  await admin.click(`[data-call-recording="${REC}"] [data-call-transcript-toggle]`);
  check("…pressed again, it closes", Boolean(await until(async () => !(await admin.ev(`!!document.querySelector('[data-call-panel]')`)))));
  await admin.click(`[data-call-recording="${REC}"] [data-call-transcript-toggle]`);
  await until(() => admin.ev(`!!document.querySelector('[data-call-panel="transcript"]')`));
  await admin.click("[data-call-panel-close]");
  check("…and its X closes it", Boolean(await until(async () => !(await admin.ev(`!!document.querySelector('[data-call-panel]')`)))));

  section("A call not recorded");
  check("no buttons, nothing beneath it", await admin.ev(`!document.querySelector('tr[data-call="${PLAIN}"] [data-call-transcript-toggle]') && !document.querySelector('tr[data-call="${PLAIN}"]')?.nextElementSibling?.dataset.callTranscriptRow`));
} finally {
  browser.close();
  sql(`delete from public.phone_recordings where recording_sid = ${lit(REC)}`);
  sql(`delete from public.phone_calls where call_sid in (${lit(RECORDED)}, ${lit(PLAIN)})`);
  sql(`delete from public.leads where id = ${LEAD}`);
}

finish("call log transcript");
