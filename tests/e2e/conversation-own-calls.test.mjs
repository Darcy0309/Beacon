/**
 * A lead's calls and recordings are only the ones made from it (Sean, Nov 2026: "call history/recordings are
 * still crossing over"). Calls to the same number whose lead is gone (the old imports deleted: a call's lead
 * clears with it) or from before calls kept their lead, recordings and all, are on no new lead with that
 * number; its own call is.
 *
 *   node tests/run.mjs tests/e2e/conversation-own-calls.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `OWN-CALLS ${Date.now()}`;
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n / 2))].map((b) => b.toString(16).padStart(2, "0")).join("");
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const tail = String(Date.now()).slice(-4);
const MOBILE = `801337${tail}`;
// The new lead (BTC Ins, as Sean's), with his own cell number on it.
const lead = Number(sql(`insert into public.leads (company_name, contact_name, contact_mobile, assigned_user_id)
  values (${lit(`${TAG} BTC Ins Prospect`)}, 'Sean Test', ${lit(`(801) 337-${tail}`)}, ${SEAN}) returning id`));
const call = ({ leadId = null, daysAgo = 0 }) => {
  const parent = `CA${hex(32)}`;
  sql(`insert into public.phone_calls (call_sid, parent_sid, user_id, direction, number, status, started_at, answered_at, ended_at, talk_seconds, lead_id)
    values (${lit(`CA${hex(32)}`)}, ${lit(parent)}, ${SEAN}, 'out', '+1${MOBILE}', 'completed', now() - interval '${daysAgo} days',
      now() - interval '${daysAgo} days', now() - interval '${daysAgo} days' + interval '1 minute', 40, ${leadId ?? "null"})`);
  const rec = `RE${hex(32)}`;
  sql(`insert into public.phone_recordings (recording_sid, call_sid, user_id, number, seconds, lead_id)
    values (${lit(rec)}, ${lit(parent)}, ${SEAN}, ${lit(MOBILE)}, 40, ${leadId ?? "null"})`);
  return { parent, rec };
};
// Capital's old calls to the same number, Nov 9 and 11: their lead deleted since (its id cleared with it).
const OLD = [call({ daysAgo: 9 }), call({ daysAgo: 7 })];
// The new lead's own call, today.
const OWN = call({ leadId: lead });

const browser = await launchBrowser();
try {
  section("The new lead's Conversation");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1400, height: 1000 });
  await sean.go(`/leads/${lead}?tab=conversation`, 7000);
  await until(() => sean.ev("!!document.querySelector('[data-lead-conversation]')"), { timeout: 20000 });
  const calls = await until(async () => {
    const n = await sean.ev("document.querySelectorAll('[data-conversation-call]').length");
    return n > 0 ? n : null;
  }, { timeout: 15000 });
  check("only its own call", calls === 1, String(calls));
  const recs = await sean.ev("[...document.querySelectorAll('[data-conversation-recording]')].length");
  check("…and only its own recording, none of the old calls' to that number", recs === 1, String(recs));
} finally {
  browser.close();
  const parents = [...OLD, OWN].map((c) => lit(c.parent)).join(",");
  sql(`delete from public.phone_recordings where call_sid in (${parents})`);
  sql(`delete from public.phone_calls where parent_sid in (${parents})`);
  sql(`delete from public.leads where id = ${lead}`);
}

finish("conversation own calls");
