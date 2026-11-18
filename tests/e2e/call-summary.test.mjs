/**
 * A recorded call's AI summary (client, Nov 2026), end to end in a real browser, with a stand-in for
 * Anthropic's API run by this test: "AI summary" under a transcribed call sends its transcript to
 * Claude (the model, structured output, fallbacks, each side named), shows the summary, keeps it (no
 * second request when opened again), writes it afresh on "Again", says plainly when the AI fails, and
 * is only for whoever may play the recording.
 *
 * Needs the app started with:
 *   ANTHROPIC_API_KEY=sk-ant-test  ANTHROPIC_BASE_URL=http://127.0.0.1:4811
 *
 *   node tests/run.mjs tests/e2e/call-summary.test.mjs
 */
import { createServer } from "node:http";
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const PORT = Number(process.env.TEST_ANTHROPIC_PORT ?? 4811);
const SHOTS = process.env.SHOTS;
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n / 2))].map((b) => b.toString(16).padStart(2, "0")).join("");

// The stand-in: Anthropic's Messages API. Answers with `next` (a summary, or an error status).
const asked = [];
let next = { overview: "Reached Marco Ruiz at Coastline Auto; policy renews in March.", points: ["Renews March 1", "With Progressive now"], next_step: "Meeting Friday at 10 AM" };
const stand = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const json = (code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  if (req.method !== "POST" || !req.url.startsWith("/v1/messages")) return json(404, { type: "error", error: { type: "not_found_error", message: "no stand-in" } });
  asked.push({ body: JSON.parse(raw), key: req.headers["x-api-key"] ?? String(req.headers.authorization ?? "").replace(/^Bearer /, ""), beta: req.headers["anthropic-beta"] ?? "" });
  if (typeof next === "number") return json(next, { type: "error", error: { type: "invalid_request_error", message: "stand-in says no" } });
  json(200, {
    id: `msg_${hex(24)}`, type: "message", role: "assistant", model: "claude-opus-5-5",
    content: [{ type: "text", text: JSON.stringify(next) }],
    stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 120, output_tokens: 60 },
  });
});
await new Promise((ok) => stand.listen(PORT, "127.0.0.1", ok));

const TAG = `CS-E2E ${Date.now()}`;
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const tail = String(Date.now()).slice(-4);
const MOBILE = `480555${tail}`;
const lead = Number(sql(`insert into public.leads (company_name, contact_name, contact_mobile, assigned_user_id)
  values (${lit(`${TAG} Coastline Auto`)}, 'Marco Ruiz', ${lit(`(480) 555-${tail}`)}, ${SEAN}) returning id`));
const PARENT = `CA${hex(32)}`;
const REC = `RE${hex(32)}`;
sql(`insert into public.phone_calls (call_sid, parent_sid, user_id, direction, number, status, answered_at, ended_at, talk_seconds)
  values (${lit(`CA${hex(32)}`)}, ${lit(PARENT)}, ${SEAN}, 'out', '+1${MOBILE}', 'completed', now() - interval '2 minutes', now(), 95)`);
const LINES = [
  { side: 1, at: 0.6, text: "Hi, this is Sean with Signature Marketing." },
  { side: 2, at: 3.2, text: "Hey Sean, Marco here." },
  { side: 1, at: 5, text: "When does your policy renew?" },
  { side: 2, at: 7.4, text: "March. Send me pricing and come by Friday at ten." },
];
sql(`insert into public.phone_recordings (recording_sid, call_sid, user_id, number, seconds, lead_id, transcript_status, transcript)
  values (${lit(REC)}, ${lit(PARENT)}, ${SEAN}, ${lit(MOBILE)}, 95, ${lead}, 'done', ${lit(JSON.stringify(LINES))}::jsonb)`);
const kept = () => JSON.parse(sql(`select row_to_json(t)::text from (select summary, summary_model, summary_at is not null as at from public.phone_recordings where recording_sid = ${lit(REC)}) t`) || "null");

const browser = await launchBrowser({ mouse: true });
const when = (page, expr, timeout = 20000) => until(() => page.ev(expr), { timeout });
const box = (page) => page.ev("document.querySelector('[data-call-summary]')?.innerText ?? null");

try {
  section("AI summary: written from the transcript");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await sean.go(`/leads/${lead}?tab=conversation`, 7000);
  check("offered beside Show transcript", Boolean(await when(sean, "document.querySelector('[data-call-summary-toggle]')?.innerText.trim() === 'AI summary'")));
  await sean.click("[data-call-summary-toggle]");
  const shown = await when(sean, "document.querySelector('[data-call-summary]')?.innerText ?? null");
  check("the summary shown: overview, points, next step", /renews in March/.test(shown ?? "") && /With Progressive now/.test(shown ?? "") && /Next step:\s*Meeting Friday at 10 AM/.test(shown ?? ""), shown);
  const first = asked[0];
  check("Claude asked once, with the server's key", asked.length === 1 && first.key === "sk-ant-test", `${asked.length} ${first?.key}`);
  check("…Opus 5.5, low effort, answer as JSON to the schema", first.body.model === "claude-opus-5-5" && first.body.output_config?.effort === "low" && first.body.output_config?.format?.type === "json_schema"
    && first.body.output_config.format.schema.required.join() === "overview,points,next_step", JSON.stringify(first.body.output_config));
  check("…with the fallback on", first.body.fallbacks === "default" && first.beta.includes("server-side-fallback-2026-07-01"), `${first.body.fallbacks} ${first.beta}`);
  const said = first.body.messages?.[0]?.content ?? "";
  check("…the transcript, each side named", /0:00 Sean Fitzgerald \(our caller\): Hi, this is Sean/.test(said) && /0:07 Marco Ruiz \(prospect\): March\./.test(said), said);
  const row = kept();
  check("kept with the recording", row?.summary?.next_step === "Meeting Friday at 10 AM" && row.summary_model === "claude-opus-5-5" && row.at, JSON.stringify(row));
  if (SHOTS) await sean.screenshot(`${SHOTS}/call-summary.png`);

  section("Kept: not written twice");
  await sean.go(`/leads/${lead}?tab=conversation`, 5000);
  await when(sean, "!!document.querySelector('[data-call-summary-toggle]')");
  check("closed until asked", !(await box(sean)));
  await sean.click("[data-call-summary-toggle]");
  check("opened again, the same summary", /renews in March/.test((await when(sean, "document.querySelector('[data-call-summary]')?.innerText ?? null")) ?? ""));
  check("…and Claude not asked again", asked.length === 1, String(asked.length));

  section("Again: written afresh");
  next = { overview: "Marco wants pricing before Friday.", points: [], next_step: "" };
  await sean.click("[data-call-summary-again]");
  check("the new one shown", Boolean(await when(sean, "/pricing before Friday/.test(document.querySelector('[data-call-summary]')?.innerText ?? '')")));
  check("…no next step: none shown", !(await sean.ev("/Next step/.test(document.querySelector('[data-call-summary]')?.innerText ?? '')")));
  check("…and kept", kept()?.summary?.overview === "Marco wants pricing before Friday." && asked.length === 2);

  section("The AI fails: said plainly, nothing lost");
  next = 400;
  await sean.click("[data-call-summary-again]");
  const err = await when(sean, "document.querySelector('[data-call-summary-error]')?.innerText ?? null");
  check("an error shown", /couldn.t summarize this call/i.test(err ?? ""), err);
  check("…the kept summary as it was", kept()?.summary?.overview === "Marco wants pricing before Friday.");

  section("Only for whoever may play it");
  const other = await (await browser.newContext({ as: "mike@beacon.test" })).newPage({ width: 1200, height: 900 });
  await other.go("/", 4000);
  const status = await other.ev(`fetch('/api/phone/recordings/${REC}/summary', { method: 'POST' }).then((r) => r.status)`);
  check("someone else's recording: refused", status === 403 || status === 404, String(status));
} finally {
  browser.close();
  stand.close();
  sql(`delete from public.phone_recordings where recording_sid = ${lit(REC)}`);
  sql(`delete from public.phone_calls where parent_sid = ${lit(PARENT)}`);
  sql(`delete from public.activity_log where entity = 'lead' and entity_id = ${lead}`);
  sql(`delete from public.leads where id = ${lead}`);
}

finish("call summary");
