/**
 * Talk to type (Sean, Nov 2026): a microphone in the lead's notes and in the search, using the
 * browser's own speech recognition. A test browser has no microphone, so a stand-in recognizer takes
 * the browser's place, giving words as Chrome does (still settling, then fixed; stopping after a pause,
 * as Safari does): what is said goes in at the cursor after the day's stamp, live; a pause doesn't
 * lose it; Stop stops; the note saves; a refused microphone says so; the search takes what is said;
 * and a browser without speech recognition shows no microphone at all.
 *
 * Removes everything it made.
 *
 *   node tests/run.mjs tests/e2e/dictation.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `DT${Date.now()}`;
const co = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts`)}, ${co}, (select id from public.project_types where code = 'APPT'), 1) returning id`));
const lead = Number(sql(`insert into public.leads (company_name, project_id, phone) values (${lit(`${TAG} Delta Door`)}, ${project}, '480-555-0199') returning id`));

// The stand-in: records what Lighthouse asks of it; the test says the words (window.__say) or ends it.
const FAKE = `(() => {
  window.__recs = [];
  class Fake {
    constructor() { window.__recs.push(this); this.lang = ""; this.continuous = false; this.interimResults = false; }
    start() { this.started = true; window.__rec = this; }
    stop() { this.stopped = true; setTimeout(() => this.onend?.(), 0); }
    abort() { this.stopped = true; }
  }
  window.SpeechRecognition = Fake;
  window.webkitSpeechRecognition = Fake;
  // [[text, final], …]: this session's results so far, as the browser hands them over.
  window.__say = (parts) => {
    const results = parts.map(([t, f]) => Object.assign([{ transcript: t }], { isFinal: f }));
    window.__rec.onresult?.({ results });
  };
})()`;

const browser = await launchBrowser({ mouse: true });
try {
  const ctx = await browser.newContext({ as: "admin@beacon.test" });
  const p = await ctx.newPage({ width: 1500, height: 1000 });
  await p.send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE });

  section("In a lead's notes");
  await p.go(`/leads/${lead}`, 5000);
  await p.click('[role=tab][data-tab="notes"]');
  await p.click('[data-note="internal"] button[aria-label^="Edit"]');
  const box = '[data-note="internal"] textarea';
  check("the notes box has a microphone", Boolean(await until(() => p.ev(`!!document.querySelector('[data-note="internal"] [data-dictation]')`))));
  await p.mouseClick('[data-note="internal"] [data-dictation]');
  check("pressed: listening, in English, words as they come", Boolean(await until(() => p.ev(`document.querySelector('[data-note="internal"] [data-dictation]')?.dataset.dictation === 'on'`)))
    && (await p.ev(`(() => { const r = window.__rec; return r && r.lang === 'en-US' && r.continuous && r.interimResults; })()`)));
  const value = () => p.ev(`document.querySelector('${box}').value`);
  const stamped = await until(() => value().then((v) => (/: $/.test(v) ? v : null)));
  check("…the box stepped into: today's line stamped, as typing does", Boolean(stamped), JSON.stringify(await value()));
  await p.ev(`window.__say([["Called the owner", false]])`);
  check("words still settling show as they are heard", (await value()).endsWith(": Called the owner"), JSON.stringify(await value()));
  await p.ev(`window.__say([["Called the owner, wants a quote in March.", true]])`);
  check("…then fixed, not written twice", (await value()).endsWith(": Called the owner, wants a quote in March.") && (await value()).split("Called the owner").length === 2, JSON.stringify(await value()));
  check("…the cursor after them", await p.ev(`(() => { const b = document.querySelector('${box}'); return b.selectionStart === b.value.length && document.activeElement === b; })()`));

  // A pause: the browser stops by itself (Safari does); listening carries on, the words kept.
  const before = await p.ev(`window.__recs.length`);
  await p.ev(`window.__rec.onend()`);
  check("a pause doesn't stop it: listening again", Boolean(await until(() => p.ev(`window.__recs.length === ${before + 1} && window.__rec.started`))));
  await p.ev(`window.__say([["Call back Tuesday.", true]])`);
  check("…what is said next follows what was said", (await value()).endsWith(": Called the owner, wants a quote in March. Call back Tuesday."), JSON.stringify(await value()));

  await p.mouseClick('[data-note="internal"] [data-dictation]');
  check("pressed again: stopped", Boolean(await until(() => p.ev(`document.querySelector('[data-note="internal"] [data-dictation]')?.dataset.dictation === 'off'`))));
  await p.click('[data-note="internal"] form button[type=submit]');
  const saved = await until(() => sql(`select coalesce((select notes from public.lead_notes where lead_id = ${lead}), '')`) || null, { timeout: 10000 });
  check("saved: the note, stamped, as it was said", /: Called the owner, wants a quote in March\. Call back Tuesday\.$/.test(saved ?? ""), JSON.stringify(saved));

  section("A microphone refused");
  await p.click('[data-note="internal"] button[aria-label^="Edit"]');
  await until(() => p.ev(`!!document.querySelector('[data-note="internal"] [data-dictation]')`));
  await p.mouseClick('[data-note="internal"] [data-dictation]');
  await until(() => p.ev(`!!window.__rec?.started && document.querySelector('[data-note="internal"] [data-dictation]')?.dataset.dictation === 'on'`));
  await p.ev(`(() => { window.__rec.onerror({ error: "not-allowed" }); window.__rec.onend(); })()`);
  const said = await p.waitToast(/microphone/i, 6000);
  check("says why: allow the microphone", /needs your microphone/.test(said ?? ""), said);
  check("…and stops, not trying again", Boolean(await until(() => p.ev(`document.querySelector('[data-note="internal"] [data-dictation]')?.dataset.dictation === 'off'`))));
  await p.ev(`document.querySelector('${box}').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);

  section("In the search");
  await p.ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))`);
  check("the search has a microphone", Boolean(await until(() => p.ev(`!!document.querySelector('[role=dialog] [data-dictation]')`))));
  await p.mouseClick('[role=dialog] [data-dictation]');
  await until(() => p.ev(`!!window.__rec?.started && document.querySelector('[role=dialog] [data-dictation]')?.dataset.dictation === 'on'`));
  await p.ev(`window.__say([["${TAG} Delta Door.", true]])`);
  const q = () => p.ev(`document.querySelector('[role=dialog] input')?.value`);
  check("what is said is the search, without its full stop", (await until(() => q().then((v) => (v === `${TAG} Delta Door` ? v : null)))) === `${TAG} Delta Door`, JSON.stringify(await q()));
  check("…and it finds the lead", Boolean(await until(() => p.ev(`document.querySelector('[role=dialog]')?.innerText.includes(${JSON.stringify(`${TAG} Delta Door`)})`), { timeout: 8000 })));
  await p.ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  check("closed: listening ends with it", Boolean(await until(() => p.ev(`!!window.__rec?.stopped`))));

  section("A browser without speech recognition");
  const plain = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 1000 });
  await plain.send("Page.addScriptToEvaluateOnNewDocument", { source: "delete window.SpeechRecognition; delete window.webkitSpeechRecognition;" });
  await plain.go(`/leads/${lead}`, 5000);
  await plain.click('[role=tab][data-tab="notes"]');
  await plain.click('[data-note="internal"] button[aria-label^="Edit"]');
  await until(() => plain.ev(`!!document.querySelector('${box}')`));
  check("no microphone where it can't be used", !(await plain.ev(`!!document.querySelector('[data-dictation]')`)));
  // Typed there, and saved: what was typed, never a box drawn earlier (Nov 2026: a note once saved empty).
  await plain.ev(`(() => { const b = document.querySelector('${box}'); b.focus(); })()`);
  await new Promise((r) => setTimeout(r, 300));
  await plain.ev(`(() => { const b = document.querySelector('${box}'); b.value += "Typed, not said."; })()`);
  await plain.click('[data-note="internal"] form button[type=submit]');
  const typed = await until(() => { const v = sql(`select coalesce((select notes from public.lead_notes where lead_id = ${lead}), '')`); return /Typed, not said\.$/.test(v) ? v : null; }, { timeout: 10000 });
  check("…and a note typed there saves as typed", Boolean(typed), JSON.stringify(sql(`select coalesce((select notes from public.lead_notes where lead_id = ${lead}), '')`)));
} finally {
  await browser.close();
  sql(`delete from public.lead_notes where lead_id = ${lead}; delete from public.leads where id = ${lead}; delete from public.projects where id = ${project}; delete from public.companies where id = ${co};`);
}
finish("Talk to type");
