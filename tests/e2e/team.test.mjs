/**
 * Meet the Team, more than a gallery (Oct 2026): the week's spotlight (an
 * administrator can hide it), live status (on the phones now), what each one
 * developed for the client, a profile with their latest work, a message, a
 * thank-you (one a day), and on someone's birthday flowers, confetti and a
 * gift to send with a note; the birthday set on My Security.
 *
 *   npm run test:e2e
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `TEAM-TEST ${Date.now()}`;
const AGENT = Number(sql("select id from public.users where email='agent@beacon.test'"));
const CLIENT = Number(sql("select id from public.users where email='client@beacon.test'"));
const ADMIN = Number(sql("select id from public.users where email='admin@beacon.test'"));
const clientCompany = sql(`select coalesce(company_id::text, 'null') from public.users where id=${CLIENT}`);
const before = JSON.parse(sql(`select json_build_object('bio', bio, 'birthday', birthday)::text from public.users where id=${AGENT}`));
const today = sql("select (now() at time zone public.business_tz())::date");
const typeId = (c) => sql(`select id from public.project_types where code=${lit(c)}`);
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const P = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Churches`)}, ${company}, ${typeId("APPT")}, 1) returning id`));
sql(`update public.users set company_id = ${company} where id = ${CLIENT}`);
const L = Number(sql(`insert into public.leads (company_name, project_id, stage) values (${lit(`${TAG} Fusion Air`)}, ${P}, 'appt') returning id`));
// The agent: a birthday today, a line, a lead and an appointment for this client, and a call just now.
sql(`update public.users set bio = ${lit(`${TAG} Ten years on the phones`)}, birthday = make_date(2000, extract(month from '${today}'::date)::int, extract(day from '${today}'::date)::int) where id = ${AGENT}`);
sql(`insert into public.pay_events (user_id, project_id, lead_id, kind, amount) values (${AGENT}, ${P}, ${L}, 'lead', 0), (${AGENT}, ${P}, ${L}, 'appointment', 0)`);
sql(`insert into public.call_records (user_id, project_id, lead_id, call_date, notes) values (${AGENT}, ${P}, ${L}, now() - interval '2 minutes', ${lit(TAG)})`);

const browser = await launchBrowser();
const when = (page, expr, timeout = 20000) => until(() => page.ev(expr), { timeout });
const card = (page, id) => page.ev(`document.querySelector('[data-team-member="${id}"]')?.innerText.replace(/\\s+/g, ' ') ?? ''`);
try {
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1440, height: 950 });
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 950 });

  section("Their card, for the client");
  await client.go("/team", 6000);
  await when(client, `!!document.querySelector('[data-team-group=mine] [data-team-member="${AGENT}"]')`);
  const c = await card(client, AGENT);
  check("among those who work their projects: on the phones now", (await client.ev(`document.querySelector('[data-team-member="${AGENT}"]').dataset.status`)) === "calling" && /On the phones now/.test(c), c);
  check("…what they developed for them", /For you: 1 lead · 1 appointment this month/.test(c), c);
  check("…and their birthday: flowers, confetti and a gift to send", /Happy birthday/.test(c) && Boolean(await client.ev(`!!document.querySelector('[data-team-member="${AGENT}"] .bday-confetti') && !!document.querySelector('[data-gift-button="${AGENT}"]')`)));
  check("today's birthdays at the top of the page", /Happy birthday/.test((await client.ev("document.querySelector('[data-birthday-banner]')?.innerText")) ?? ""));
  check("the week's spotlight", Boolean(await client.ev("!!document.querySelector('[data-team-spotlight]')")));
  check("a message only to those who work their projects", Boolean(await client.ev(`!!document.querySelector('[data-message-button="${AGENT}"]')`))
    && (await client.ev("[...document.querySelectorAll('[data-team-group=rest] [data-message-button]')].length")) === 0);

  section("A birthday gift");
  await client.click(`[data-gift-button="${AGENT}"]`);
  await when(client, "!!document.querySelector('[data-gift-dialog]')");
  check("nine gifts to pick from", (await client.ev("document.querySelectorAll('[data-gift]').length")) === 9);
  await client.click('[data-gift="cake"]');
  await client.fill("[data-gift-note]", `${TAG} Have a great one!`);
  await client.click("[data-send-gift]", "Send gift");
  check("sent: kept, and they are told", Boolean(await until(() => sql(`select count(*) from public.kudos where to_user = ${AGENT} and kind = 'birthday' and gift = 'cake' and note like ${lit(`${TAG}%`)}`) === "1" || null, { timeout: 10000 }))
    && sql(`select count(*) from public.notifications where user_id = ${AGENT} and title like '🎂%happy birthday%' and body like ${lit(`${TAG}%`)}`) === "1");
  check("…and the card counts it", Boolean(await when(client, `/1 gift today/.test(document.querySelector('[data-team-member="${AGENT}"]')?.innerText ?? '')`)));

  section("A thank-you and a message");
  await client.click(`[data-thanks-button="${AGENT}"]`);
  await when(client, "!!document.querySelector('[data-thanks-dialog]')");
  await client.fill("[data-thanks-note]", `${TAG} Great appointment`);
  await client.click("[data-send-thanks]", "Say thank you");
  check("a thank-you, counted on their card", Boolean(await until(() => sql(`select count(*) from public.kudos where to_user = ${AGENT} and kind = 'thanks' and from_user = ${CLIENT}`) === "1" || null, { timeout: 10000 }))
    && Boolean(await when(client, `document.querySelector('[data-team-member="${AGENT}"] [data-kudos]')?.dataset.kudos >= '1'`)));
  const clientAuth = sql(`select auth_id from public.users where id = ${CLIENT}`);
  const asClient = (q) => { try { return sql(`set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', '${clientAuth}', 'role', 'authenticated')::text, true); ${q}`).split("\n").at(-1); } catch (e) { return String(e.stderr ?? e.message); } };
  check("…one a day", /thanked them today already/.test(asClient(`select public.send_kudos(${AGENT}, 'thanks', null, 'again')`)));
  check("…no gift when it is not their birthday", /for their birthday/.test(asClient(`select public.send_kudos(${ADMIN}, 'birthday', 'cake', null)`)));
  await client.click(`[data-message-button="${AGENT}"]`);
  await when(client, "!!document.querySelector('[data-message-dialog]')");
  await client.fill("[data-message-body]", `${TAG} Can you call Fusion Air back?`);
  await client.click("[data-send-message]", "Send");
  check("a message, to answer from their notifications", Boolean(await until(() => sql(`select count(*) from public.notifications where user_id = ${AGENT} and kind = 'message' and sender_id = ${CLIENT} and body = ${lit(`${TAG} Can you call Fusion Air back?`)}`) === "1" || null, { timeout: 10000 })));
  check("…but not to someone who does not work their projects", /people who work your projects/.test(asClient(`select public.message_team_member(${ADMIN}, 'hi')`)));

  section("Their profile");
  await client.click(`[data-open-profile="${AGENT}"]`);
  const profile = (await when(client, "document.querySelector('[data-profile-dialog]')?.innerText.replace(/\\s+/g, ' ')")) ?? "";
  check("on the team since, what they did for them, their thank-yous", /On the team/.test(profile) && /In all for you 1 leads · 1 appointments/.test(profile) && /Thank-yous 1/.test(profile), profile.slice(0, 300));
  check("…and their latest work, to open", Boolean(await when(client, `!!document.querySelector('[data-profile-recent] a[href="/leads/${L}"]')`)));

  section("Filters");
  await client.ev("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), true");
  await client.go("/team", 5000);
  await when(client, "!!document.querySelector('[data-team-filter=admins]')");
  await client.click("[data-team-filter=admins]");
  check("Administrators: only administrators", Boolean(await when(client, `!document.querySelector('[data-team-member="${AGENT}"]') && !!document.querySelector('[data-team-member="${ADMIN}"]')`)));

  section("The spotlight, an administrator's to hide");
  await admin.go("/team", 6000);
  await when(admin, "!!document.querySelector('[data-spotlight-switch=hide]')");
  await admin.click("[data-spotlight-switch=hide]");
  check("hidden", Boolean(await until(() => sql("select coalesce(value->>'spotlight', '') from public.app_settings where key = 'team'") === "false" || null, { timeout: 10000 })));
  await client.go("/team", 5000);
  check("…for everyone", Boolean(await when(client, `!!document.querySelector('[data-team-member="${AGENT}"]') && !document.querySelector('[data-team-spotlight]')`)));
  await admin.go("/team", 5000);
  await when(admin, "!!document.querySelector('[data-spotlight-switch=show]')");
  await admin.click("[data-spotlight-switch=show]");
  check("…and back", Boolean(await until(() => sql("select coalesce(value->>'spotlight', '') from public.app_settings where key = 'team'") === "true" || null, { timeout: 10000 })));

  section("Their birthday, on My Security");
  const agent = await (await browser.newContext({ as: "agent@beacon.test" })).newPage({ width: 1440, height: 950 });
  await agent.go("/security", 6000);
  await when(agent, "!!document.querySelector('[data-birthday] select[name=birthday_month]')");
  await agent.fill("select[name=birthday_month]", "3");
  await agent.fill("select[name=birthday_day]", "14");
  await agent.click("[data-profile-form] button[type=submit]", "Save");
  check("month and day, no year", Boolean(await until(() => sql(`select coalesce(birthday::text, '') from public.users where id = ${AGENT}`) === "2000-03-14" || null, { timeout: 10000 })));
  await agent.fill("select[name=birthday_month]", "4");
  await agent.fill("select[name=birthday_day]", "31");
  await agent.click("[data-profile-form] button[type=submit]", "Save");
  check("…a day the month does not have is refused", Boolean(await when(agent, "/not in that month/.test(document.querySelector('[data-profile-form]')?.innerText ?? '')", 8000)));
} finally {
  browser.close();
  sql(`update public.users set company_id = ${clientCompany} where id = ${CLIENT}`);
  sql(`update public.users set bio = ${before.bio ? lit(before.bio) : "null"}, birthday = ${before.birthday ? lit(before.birthday) : "null"} where id = ${AGENT}`);
  sql(`delete from public.kudos where to_user = ${AGENT} and created_at > now() - interval '1 hour'`);
  sql(`delete from public.notifications where user_id = ${AGENT} and (body like ${lit(`${TAG}%`)} or title like '%says thank you%' and created_at > now() - interval '1 hour')`);
  sql(`delete from public.app_settings where key = 'team'`);
  sql(`delete from public.call_records where notes = ${lit(TAG)}`);
  sql(`delete from public.pay_events where lead_id = ${L}`);
  sql(`delete from public.leads where id = ${L}`);
  sql(`delete from public.projects where id = ${P}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("team");
