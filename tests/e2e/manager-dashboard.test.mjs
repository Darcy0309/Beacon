/**
 * Two of the client's requests (Sean, Oct 2026), end to end:
 *
 *   The account manager's dashboard: four tiles of their own — Appointments
 *   and Leads they developed (the pay period, or a week or month as chosen
 *   on the tile), Active Projects by kind with the 30-day change, and Daily
 *   Production with the goals they set for the day. An administrator sees
 *   every manager's day: started, calls, leads and appointments against
 *   goal, hours.
 *
 *   Accounts with temporary passwords: an administrator creates one with a
 *   temporary password (no invitation email needed), the person signs in
 *   with it and must choose their own; an administrator gives an existing
 *   account a new temporary password the same way; and each person updates
 *   their own contact details on My Security.
 *
 * Puts back everything it changed.
 *
 *   npm run test:e2e
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { adminClient } from "../support/auth.mjs";

const RUN = Date.now();
const SEAN = Number(sql("select id from public.users where email = 'sean@beacon.test'"));
const today = sql("select ((now() at time zone public.business_tz())::date)::text");
const NEW_EMAIL = `temp.${RUN}@beacon.test`;
const goalsBefore = sql(`select coalesce(json_agg(g), '[]') from public.daily_goals g where user_id = ${SEAN} and day = ${lit(today)}`);
sql(`delete from public.daily_goals where user_id = ${SEAN} and day = ${lit(today)}`);

const browser = await launchBrowser();
const tile = (page, label) => page.ev(`[...document.querySelectorAll('[data-panel]')].find((t) => t.querySelector('.stat-label')?.textContent.trim() === ${JSON.stringify(label)})?.innerText ?? null`);

/** Sign in through the sign-in page, as the person would. */
async function signInAs(email, password) {
  const page = await (await browser.newContext()).newPage();
  await page.go("/login", 3000);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click("button[type=submit]", "Sign in");
  return page;
}

try {
  section("The account manager's dashboard");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 950 });
  await sean.go("/", 4000);
  const labels = await sean.ev(`[...document.querySelectorAll('[data-panel] .stat-label')].map((e) => e.textContent.trim()).slice(0, 4)`);
  check("four tiles of their own: Appointments, Leads, Active Projects, Daily Production",
    JSON.stringify(labels) === JSON.stringify(["Appointments", "Leads", "Active Projects", "Daily Production"]), JSON.stringify(labels));
  check("…no Total Leads or Conversion Rate", !/Total Leads|Conversion Rate/i.test(await sean.ev(`[...document.querySelectorAll('[data-panel] .stat-label')].map((e) => e.textContent).join(' ')`)));
  check("Appointments and Leads count this pay period by default", /Developed this pay period/.test(await tile(sean, "Appointments")) && /Developed this pay period/.test(await tile(sean, "Leads")));
  await sean.click('[data-period-switch="ap"] a', "Week");
  check("…a tile can count the week instead, the other keeping its own",
    Boolean(await until(async () => /Developed this week/.test((await tile(sean, "Appointments")) ?? ""))) && /Developed this pay period/.test(await tile(sean, "Leads")), await tile(sean, "Appointments"));
  await sean.click('[data-period-switch="ld"] a', "Month");
  check("…or the month", Boolean(await until(async () => /Developed this month/.test((await tile(sean, "Leads")) ?? ""))) && /Developed this week/.test(await tile(sean, "Appointments")));
  check("Active Projects: how many, by kind, and the change in 30 days", /\d+ Lead · \d+ Appointment/.test(await tile(sean, "Active Projects")) && /in the last 30 days/.test(await tile(sean, "Active Projects")), await tile(sean, "Active Projects"));
  check("Daily Production: today's leads and appointments and hours worked", /lead.*appointment.*today.*worked/s.test(await tile(sean, "Daily Production")), await tile(sean, "Daily Production"));
  await sean.fill('[data-daily-goals-form] input[name="leads_goal"]', "4");
  await sean.fill('[data-daily-goals-form] input[name="appts_goal"]', "2");
  await sean.click("[data-daily-goals-form] button[type=submit]");
  check("…the manager sets the day's goal as they start", Boolean(await until(() => sql(`select leads_goal || '/' || appts_goal from public.daily_goals where user_id = ${SEAN} and day = ${lit(today)}`) === "4/2")));
  check("…and the tile tracks the % reached", Boolean(await until(async () => /Leads\s*\d+ \/ 4\s*\d+%/.test((await tile(sean, "Daily Production")) ?? ""))), await tile(sean, "Daily Production"));

  section("An administrator sees every manager's day");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 950 });
  await admin.go("/", 4000);
  const row = await admin.ev(`document.querySelector('[data-production-row="${SEAN}"]')?.innerText.replace(/\\s+/g, ' ') ?? null`);
  check("Daily Production lists each manager: started, calls, leads and appointments against goal, hours", Boolean(row) && /Sean/.test(row) && /\/ 4/.test(row) && /\/ 2/.test(row), row);
  check("…the admin's own tiles are unchanged", /Total Leads/i.test(await admin.ev(`[...document.querySelectorAll('[data-panel] .stat-label')].map((e) => e.textContent).join(' ')`)));

  section("Creating an account with a temporary password");
  await admin.go("/users", 4000);
  await admin.click("button", "Add user");
  await until(() => admin.ev(`!!document.querySelector('[role=dialog] input[name="email"]')`));
  await admin.fill('[role=dialog] input[name="first_name"]', "Temp");
  await admin.fill('[role=dialog] input[name="last_name"]', `Tester ${RUN}`);
  await admin.fill('[role=dialog] input[name="email"]', NEW_EMAIL);
  await admin.click('[data-access-choice="password"]');
  const temp = await until(() => admin.ev(`document.querySelector('[role=dialog] input[name="temp_password"]')?.value || null`));
  check("choosing a temporary password suggests one, easy to read out", /^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/.test(temp ?? ""), temp);
  await admin.ev(`document.querySelector('[role=dialog] input[name="send_link"]').click()`); // no email in this test
  await admin.click("[role=dialog] button[type=submit]", "Create account");
  check("the account is made at once, waiting for them to choose their own password",
    Boolean(await until(() => sql(`select status || '|' || must_change_password from public.users where email = ${lit(NEW_EMAIL)}`) === "invited|true")),
    sql(`select coalesce(status || '|' || must_change_password, 'none') from public.users where email = ${lit(NEW_EMAIL)}`));

  const person = await signInAs(NEW_EMAIL, temp);
  // The address changes before the page arrives: wait for what it says.
  check("they sign in with it and are taken to choose their own",
    Boolean(await until(async () => (await person.path()) === "/security" && /temporary password from your administrator/i.test(await person.text()), { timeout: 10000 })), await person.url());
  const mine = `Mine-${RUN}-pw`;
  await person.fill('input[name="password"]', mine);
  await person.fill('input[name="confirm"]', mine);
  await person.click("button[type=submit]", "Set password");
  check("…their own password makes the account active, the temporary one gone",
    Boolean(await until(() => sql(`select status || '|' || must_change_password from public.users where email = ${lit(NEW_EMAIL)}`) === "active|false")));

  section("A new temporary password for an existing account");
  await admin.go(`/users?q=${encodeURIComponent(NEW_EMAIL)}`, 4000);
  await admin.pointer(`button[aria-label="Actions for Temp Tester ${RUN}"]`);
  await sleep(300);
  check("each user's menu has Set temporary password", await admin.menuItem("Set temporary password"));
  const second = await until(() => admin.ev(`document.querySelector('[data-temp-password-form] input[name="temp_password"]')?.value || null`));
  check("…saying no password can be looked up", /never stored where anyone can read them/.test(await admin.ev(`document.querySelector('[role=dialog]')?.innerText ?? ''`)));
  await admin.click("[data-temp-password-form] button[type=submit]", "Set password");
  check("…it replaces theirs, and they must choose their own at the next sign-in",
    Boolean(await until(() => sql(`select must_change_password from public.users where email = ${lit(NEW_EMAIL)}`) === "t")));
  const again = await signInAs(NEW_EMAIL, second);
  check("they sign in with the new one and are taken to choose their own",
    Boolean(await until(async () => (await again.path()) === "/security" && /temporary password from your administrator/i.test(await again.text()), { timeout: 10000 })), await again.url());
  await again.go("/leads", 3000);
  check("…wherever they go, until they have", Boolean(await until(async () => (await again.path()) === "/security" && Boolean(await again.ev(`!!document.querySelector('input[name="confirm"]')`)))));
  const theirs = `Theirs-${RUN}-pw`;
  await again.fill('input[name="password"]', theirs);
  await again.fill('input[name="confirm"]', theirs);
  await again.click("button[type=submit]", "Set password");
  check("…then the flag is gone", Boolean(await until(() => sql(`select must_change_password from public.users where email = ${lit(NEW_EMAIL)}`) === "f")));

  section("My Profile");
  await again.go("/security", 3000);
  await until(() => again.ev(`!!document.querySelector('[data-profile-form]')`));
  await again.fill('[data-profile-form] input[name="phone"]', "(602) 555-0142");
  await again.fill('[data-profile-form] input[name="first_name"]', "Tempo");
  await again.click("[data-profile-form] button[type=submit]");
  check("each person updates their own contact details", Boolean(await until(() => sql(`select first_name || '|' || phone from public.users where email = ${lit(NEW_EMAIL)}`) === "Tempo|(602) 555-0142")),
    sql(`select first_name || '|' || coalesce(phone, '') from public.users where email = ${lit(NEW_EMAIL)}`));
} finally {
  browser.close();
  sql(`delete from public.daily_goals where user_id = ${SEAN} and day = ${lit(today)}`);
  for (const g of JSON.parse(goalsBefore)) sql(`insert into public.daily_goals (user_id, day, leads_goal, appts_goal) values (${g.user_id}, ${lit(g.day)}, ${g.leads_goal ?? "null"}, ${g.appts_goal ?? "null"})`);
  const authId = sql(`select coalesce(auth_id::text, '') from public.users where email = ${lit(NEW_EMAIL)}`);
  sql(`delete from public.activity_log where user_id in (select id from public.users where email = ${lit(NEW_EMAIL)})`);
  sql(`delete from public.users where email = ${lit(NEW_EMAIL)}`);
  if (authId) await adminClient().auth.admin.deleteUser(authId).catch(() => {});
}

finish("manager dashboard");
