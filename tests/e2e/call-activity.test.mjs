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
let n = 0;
const call = (user, hhmm, talk) => {
  n += 1;
  const sid = `CA${TAG.toLowerCase()}${String(n).padStart(4, "0")}`;
  const at = `(${lit(today)}::date + time ${lit(hhmm)}) at time zone public.business_tz()`;
  sql(`insert into public.phone_calls (call_sid, parent_sid, user_id, direction, number, status, started_at, rang_at, answered_at, ended_at, talk_seconds)
    values (${lit(sid)}, ${lit(sid)}, ${user}, 'out', '+16025550100', 'completed', ${at}, ${at}, ${at}, ${at} + interval '${talk} seconds', ${talk})`);
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
  check("the account managers, each with their first call", team.includes(String(SEAN)) && team.includes(String(MIKE)) && (await firstOf(sean, MIKE)) === "9:15 AM", JSON.stringify(team));
  check("…not a client's Sales Rep, nor an administrator", !team.includes(String(RACHEL)) && !team.includes(String(ADMIN)), JSON.stringify(team));
  check("…the earliest first call on the total line", (await firstOf(sean, "total")) === "7:41 AM", await firstOf(sean, "total"));
  await sean.ev(`document.querySelector('[data-call-scope-link="me"]').click()`);
  check("and back to Mine", Boolean(await until(async () => JSON.stringify(await rowsOf(sean)) === JSON.stringify([String(SEAN), "total"]), { timeout: 15000 })));

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
}

finish("call activity on the dashboard");
