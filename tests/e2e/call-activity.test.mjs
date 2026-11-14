/**
 * Call Activity on the dashboard (Sean, Nov 2026): a manager's own line to begin with, the team (account
 * managers only: no administrators, no client's Sales Rep) a click away, and each person's first call;
 * an administrator's dashboard with everyone. Needs the server to have the Twilio line set (TWILIO_*):
 * the card shows only then.
 *
 *   node tests/run.mjs tests/e2e/call-activity.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `CALLACTE${Date.now()}`;
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const SEAN = userId("sean@beacon.test");
const MIKE = userId("mike@beacon.test");
const RACHEL = userId("rachel@beacon.test");
const ADMIN = userId("admin@beacon.test");
const today = sql("select (now() at time zone public.business_tz())::date::text");
const yesterday = sql("select ((now() at time zone public.business_tz())::date - 1)::text");
let n = 0;
const call = (user, hhmm, talk, on = today) => {
  n += 1;
  const sid = `CA${TAG.toLowerCase()}${String(n).padStart(4, "0")}`;
  const at = `(${lit(on)}::date + time ${lit(hhmm)}) at time zone public.business_tz()`;
  sql(`insert into public.phone_calls (call_sid, parent_sid, user_id, direction, number, status, started_at, rang_at, answered_at, ended_at, talk_seconds)
    values (${lit(sid)}, ${lit(sid)}, ${user}, 'out', '+16025550100', 'completed', ${at}, ${at}, ${at}, ${at} + interval '${talk} seconds', ${talk})`);
};
// Mike works on Central time: his times on his own clock (Sean, Nov 2026).
const mikeZone = sql(`select coalesce(timezone_id::text, 'null') from public.users where id = ${MIKE}`);
sql(`update public.users set timezone_id = (select id from public.timezones where iana = 'America/Chicago' order by id limit 1) where id = ${MIKE}`);
const BUSINESS = sql("select public.business_tz()");
const short = (tz) => new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName").value;
// 9:15 on the business's clock, read on Central's.
const mikeAt = (hhmm) => {
  const iso = sql(`select to_char(((${lit(today)}::date + time ${lit(hhmm)}) at time zone public.business_tz()) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`);
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" });
};
const company = Number(sql(`insert into public.companies (name, sales_rep_id) values (${lit(`${TAG} Insurance`)}, ${RACHEL}) returning id`));
const rowsOf = (page) => page.ev(`[...document.querySelectorAll('[data-call-activity] [data-call-row]')].map((r) => r.dataset.callRow)`);
const firstOf = (page, id) => page.ev(`document.querySelector('[data-call-activity] [data-call-row="${id}"] [data-col="first"]')?.textContent.trim() ?? null`);

const browser = await launchBrowser();
try {
  call(SEAN, "07:41", 60);
  call(SEAN, "10:05", 30);
  call(MIKE, "09:15", 120);
  call(RACHEL, "08:00", 10);
  call(ADMIN, "08:30", 10);

  section("A manager's dashboard: their own line");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1500, height: 1000 });
  await sean.go("/", 8000);
  const shown = await until(() => sean.ev(`!!document.querySelector('[data-call-activity]')`), { timeout: 15000 });
  check("the Call Activity card is there", Boolean(shown), "is the server's Twilio line set (TWILIO_*)?");
  check("…with Mine chosen", (await sean.ev(`document.querySelector('[data-call-scope]')?.dataset.callScope`)) === "me");
  check("…and only their line, and the total", JSON.stringify(await rowsOf(sean)) === JSON.stringify([String(SEAN), "total"]), JSON.stringify(await rowsOf(sean)));
  check("…with when their first call started", (await firstOf(sean, SEAN)) === "7:41 AM", await firstOf(sean, SEAN));

  section("…the team a click away");
  await sean.ev(`document.querySelector('[data-call-scope-link="team"]').click()`);
  check("Team chosen", Boolean(await until(() => sean.ev(`document.querySelector('[data-call-scope]')?.dataset.callScope === 'team'`), { timeout: 15000 })));
  const team = await rowsOf(sean);
  check("the account managers, each with their first call", team.includes(String(SEAN)) && team.includes(String(MIKE)), JSON.stringify(team));
  check("…on their own clock, its zone named (Mike's on Central)", (await firstOf(sean, MIKE)) === `${mikeAt("09:15")} ${short("America/Chicago")}`, await firstOf(sean, MIKE));
  check("…not a client's Sales Rep, nor an administrator", !team.includes(String(RACHEL)) && !team.includes(String(ADMIN)), JSON.stringify(team));
  check("…the earliest first call on the total line, on the business's clock", (await firstOf(sean, "total")) === `7:41 AM ${short(BUSINESS)}`, await firstOf(sean, "total"));
  await sean.ev(`document.querySelector('[data-call-scope-link="me"]').click()`);
  check("and back to Mine", Boolean(await until(async () => JSON.stringify(await rowsOf(sean)) === JSON.stringify([String(SEAN), "total"]), { timeout: 15000 })));

  section("The day's calls as a chart (yesterday, a whole day)");
  call(SEAN, "07:41", 60, yesterday);
  call(SEAN, "10:05", 30, yesterday);
  call(MIKE, "09:15", 120, yesterday);
  await sean.go(`/?cs=team&cd=${yesterday}`, 8000);
  await until(() => sean.ev(`!!document.querySelector('[data-call-chart-open]')`), { timeout: 15000 });
  await sean.ev(`document.querySelector('[data-call-chart-open]').click()`);
  const summary = () => sean.ev(`document.querySelector('[data-call-chart-summary]')?.textContent ?? null`);
  check("Chart, beside the day: everyone's calls to begin with", /^3 calls/.test((await until(summary, { timeout: 10000 })) ?? ""), await summary());
  check("…drawn as a line", await sean.ev(`(document.querySelector('[data-call-chart-line]')?.getAttribute('points') ?? '').split(' ').length > 20`));
  await sean.fill("[data-call-chart-who]", String(SEAN));
  check("one manager chosen: theirs, the first call's half hour, and their longest gap named",
    Boolean(await until(async () => /^2 calls · first 7:30 AM–8:00 AM · longest gap 8:00 AM – 10:00 AM \(2h\)/.test((await summary()) ?? ""))), await summary());
  check("…shaded on the chart", await sean.ev(`!!document.querySelector('[data-call-chart] [data-gap]')`));
  const zoneNote = () => sean.ev(`document.querySelector('[data-call-chart-zone]')?.textContent ?? ''`);
  check("…and on Sean's clock, the business's", (await zoneNote()) === `Times in ${short(BUSINESS)}.`, await zoneNote());
  await sean.fill("[data-call-chart-who]", String(MIKE));
  const mikeHalf = (() => { const [t, ap] = mikeAt("09:15").split(" "); const [h] = t.split(":"); return `${h}:00 ${ap}`; })();
  check("Mike chosen: on his own clock",
    Boolean(await until(async () => ((await summary()) ?? "").startsWith(`1 call · first ${mikeHalf}`))) && /Mike/.test(await zoneNote()), `${await summary()} | ${await zoneNote()}`);
  await sean.fill("[data-call-chart-who]", "all");
  check("everyone: back on the business's clock", Boolean(await until(async () => (await zoneNote()) === `Times in ${short(BUSINESS)}.`)), await zoneNote());
  await sean.key("Escape");

  section("An administrator's dashboard: everyone");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 1000 });
  await admin.go("/", 8000);
  await until(() => admin.ev(`!!document.querySelector('[data-call-activity]')`), { timeout: 15000 });
  const everyone = await rowsOf(admin);
  check("everyone on the phone, Sales Reps and administrators too", [SEAN, MIKE, RACHEL, ADMIN].every((id) => everyone.includes(String(id))), JSON.stringify(everyone));
  check("…with no Mine / Team switch", !(await admin.ev(`!!document.querySelector('[data-call-scope]')`)));
} finally {
  browser.close();
  sql(`delete from public.phone_calls where call_sid like ${lit(`CA${TAG.toLowerCase()}%`)}`);
  sql(`delete from public.companies where id = ${company}`);
  sql(`update public.users set timezone_id = ${mikeZone} where id = ${MIKE}`);
}

finish("call activity on the dashboard");
