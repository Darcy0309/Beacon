/**
 * Call Log (Sean, Nov 2026): "drill down by manager to show all of their outbound & inbound calls for the
 * selected date/range", from Call Activity's names and counts; and "look up a phone # that called in or
 * was dialed out", a call from a number on no lead traced to a lead with it. A manager sees their own.
 * Needs the server to have the Twilio line set (TWILIO_*): Call Activity shows only then.
 *
 *   node tests/run.mjs tests/e2e/call-log.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `CALLLOG${Date.now()}`;
const tail = String(Date.now()).slice(-4);
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const SEAN = userId("sean@beacon.test");
const MIKE = userId("mike@beacon.test");
const today = sql("select (now() at time zone public.business_tz())::date::text");
const OUT = `+1602557${tail}`;
const CELL = `+1480557${tail}`;
const project = Number(sql("select id from public.projects where deleted_at is null order by id limit 1"));
const LEAD = Number(sql(`insert into public.leads (company_name, phone, project_id) values (${lit(`${TAG} Delta Door`)}, ${lit(OUT.slice(2))}, ${project}) returning id`));
// The prospect's cell: on this lead, but the call in from it was not tied to one.
const CELL_LEAD = Number(sql(`insert into public.leads (company_name, phone, contact_mobile, project_id) values (${lit(`${TAG} Cactus Freight`)}, '6025550000', ${lit(CELL.slice(2))}, ${project}) returning id`));

let n = 0;
const sid = () => `CA${TAG.toLowerCase()}${String((n += 1)).padStart(4, "0")}`;
const at = (hhmm) => `((${lit(today)}::date + time ${lit(hhmm)}) at time zone public.business_tz())`;
const leg = ({ call = sid(), parent = call, user = null, direction, number, hhmm, answered = true, rang = true, talk = 0, lead = null }) => {
  sql(`insert into public.phone_calls (call_sid, parent_sid, user_id, direction, number, status, started_at, rang_at, answered_at, ended_at, talk_seconds, lead_id)
    values (${lit(call)}, ${lit(parent)}, ${user ?? "null"}, '${direction}', ${lit(number)}, 'completed', ${at(hhmm)}, ${rang ? at(hhmm) : "null"},
      ${answered ? at(hhmm) : "null"}, ${at(hhmm)} + interval '${talk} seconds', ${talk}, ${lead ?? "null"})`);
  return call;
};

const browser = await launchBrowser();
try {
  // Sean: a call out answered (on the lead), one not answered, and the prospect's cell calling in, taken.
  leg({ user: SEAN, direction: "out", number: OUT, hhmm: "08:10", talk: 95, lead: LEAD });
  leg({ user: SEAN, direction: "out", number: OUT, hhmm: "08:40", answered: false });
  const inbound = leg({ direction: "in", number: CELL, hhmm: "09:05", answered: false });
  leg({ parent: inbound, user: SEAN, direction: "in", number: CELL, hhmm: "09:05", talk: 40 });
  // Mike's, and a call in that rang no one.
  leg({ user: MIKE, direction: "out", number: OUT, hhmm: "10:00", talk: 15 });
  leg({ direction: "in", number: `+1520557${tail}`, hhmm: "11:00", answered: false, rang: false });

  section("From Call Activity: a manager's calls, listed");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 1000 });
  await admin.go("/", 8000);
  const link = await until(() => admin.ev(`document.querySelector('[data-call-activity] [data-call-log-link="${SEAN}"]')?.getAttribute('href') ?? null`), { timeout: 15000 });
  check("Sean's name opens his calls over the day shown", link === `/reports/calls?user=${SEAN}&from=${today}&to=${today}`, link);
  await admin.go(link, 6000);
  const rows = () => admin.ev(`[...document.querySelectorAll('[data-call-log] tr[data-call]')].map((r) => r.dataset.kind)`);
  check("…every one of his calls, newest first, and no one else's", JSON.stringify(await until(rows)) === JSON.stringify(["in_handled", "out_cancelled", "out_handled"]), JSON.stringify(await rows()));
  const count = (k) => admin.ev(`document.querySelector('[data-call-kind="${k}"] [data-count]')?.textContent ?? null`);
  check("…counted by kind as Call Activity counts them", (await count("all")) === "3" && (await count("out_handled")) === "1" && (await count("in_handled")) === "1" && (await count("missed")) === "0",
    JSON.stringify([await count("all"), await count("out_handled"), await count("in_handled"), await count("missed")]));
  const answered = await admin.ev(`[...document.querySelectorAll('[data-call-log] tr[data-kind="out_handled"] td')].map((td) => td.textContent.trim())`);
  check("…each with its number, lead and talk time", answered.some((t) => t === `(602) 557-${tail}` || t === `602-557-${tail}`) && answered.some((t) => t.includes("Delta Door")) && answered.includes("0:01:35"), JSON.stringify(answered));
  await admin.go("/", 8000);
  const countLink = await until(() => admin.ev(`document.querySelector('[data-call-activity] [data-call-row="${SEAN}"] [data-call-log-count="outHandled"]')?.getAttribute('href') ?? null`), { timeout: 15000 });
  check("a count opens those calls alone", countLink === `/reports/calls?user=${SEAN}&kind=out_handled&from=${today}&to=${today}`, countLink);
  await admin.go(countLink, 6000);
  check("…just the one answered", JSON.stringify(await until(rows)) === JSON.stringify(["out_handled"]), JSON.stringify(await rows()));
  await admin.go(`/reports/calls?user=none&from=${today}&to=${today}`, 6000);
  check("the calls in that rang no one, listed too", JSON.stringify(await until(rows)) === JSON.stringify(["missed"]), JSON.stringify(await rows()));

  section("A number looked up");
  await admin.go("/reports/calls", 6000);
  await admin.fill('[data-call-search] input[name="q"]', `(480) 557-${tail}`);
  await admin.click("[data-call-search] button[type=submit]");
  check("the prospect's cell, all time: the call in from it", Boolean(await until(async () => JSON.stringify(await rows()) === JSON.stringify(["in_handled"]), { timeout: 10000 })), JSON.stringify(await rows()));
  const traced = await admin.ev(`document.querySelector('[data-call-log] tr[data-call] [data-lead]')?.textContent ?? ''`);
  check("…on no lead, but traced to the lead with that number", traced.includes("Cactus Freight") && traced.includes("has this number"), traced);
  await admin.go(`/reports/calls?q=557${tail}`, 6000);
  check("part of a number finds every call with it", (await until(async () => ((await rows()) ?? []).length === 5 ? true : null, { timeout: 8000 })) === true, JSON.stringify(await rows()));

  section("A manager: their own calls only");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1500, height: 1000 });
  await sean.go(`/reports/calls?user=${MIKE}&q=557${tail}`, 6000);
  const theirs = await until(() => sean.ev(`[...document.querySelectorAll('[data-call-log] tr[data-call]')].map((r) => r.dataset.kind)`));
  check("asking for Mike's still gives Sean his own", JSON.stringify(theirs) === JSON.stringify(["in_handled", "out_cancelled", "out_handled"]), JSON.stringify(theirs));
  await sean.go("/", 8000);
  check("on his Call Activity, his own name opens his calls",
    Boolean(await until(() => sean.ev(`!!document.querySelector('[data-call-activity] [data-call-log-link="${SEAN}"]')`), { timeout: 15000 })));
  await sean.go("/?cs=team", 8000);
  await until(() => sean.ev(`!!document.querySelector('[data-call-activity] [data-call-row="${MIKE}"]')`), { timeout: 15000 });
  check("…a teammate's, on the team's, doesn't", !(await sean.ev(`!!document.querySelector('[data-call-activity] [data-call-log-link="${MIKE}"]')`)));
} finally {
  browser.close();
  sql(`delete from public.phone_calls where call_sid like ${lit(`CA${TAG.toLowerCase()}%`)}`);
  sql(`delete from public.leads where id in (${LEAD}, ${CELL_LEAD})`);
}

finish("call log");
