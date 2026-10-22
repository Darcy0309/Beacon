/**
 * What the old system had that came last (Sean, Oct 2026): staff photos and
 * Meet the Team, a client's own branding, project goals (on the project and
 * the Project Goals report), Hourly Progress, notes on a calendar's times,
 * and the warning as a client's subscription nears its end.
 *
 *   npm run test:e2e
 */
import { fileURLToPath } from "node:url";
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { adminClient } from "../support/auth.mjs";
import { formatIso } from "../../src/lib/dates.js";

const TAG = `OLD-TEST ${Date.now()}`;
// A picture to upload: the app's own notification icon.
const PICTURE = fileURLToPath(new URL("../../public/notification-icon.png", import.meta.url));
const AGENT = Number(sql("select id from public.users where email='agent@beacon.test'"));
const CLIENT = Number(sql("select id from public.users where email='client@beacon.test'"));
const clientCompany = sql(`select coalesce(company_id::text, 'null') from public.users where id=${CLIENT}`);
const agentBefore = JSON.parse(sql(`select json_build_object('photo', photo_path, 'bio', bio)::text from public.users where id=${AGENT}`));
const typeId = (c) => sql(`select id from public.project_types where code=${lit(c)}`);
const today = sql("select (now() at time zone public.business_tz())::date");
const company = Number(sql(`insert into public.companies (name, subscription_end) values (${lit(`${TAG} Insurance`)}, '${today}'::date + 10) returning id`));
const P = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, start_date, end_date, lead_goal, appt_goal)
  values (${lit(`${TAG} Churches`)}, ${company}, ${typeId("APPT")}, 1, '${today}'::date - 9, '${today}'::date + 20, 40, 10) returning id`));
sql(`update public.users set company_id = ${company} where id = ${CLIENT}`);
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${P}, ${AGENT})`);
// Two leads on it (of a goal of 40, ten days into thirty: behind), one an appointment.
const appt = sql("select id from public.call_results where project_type = 'APPT' and name = 'Appointment'");
sql(`insert into public.leads (company_name, project_id, result_id, stage, lead_date) select ${lit(TAG)} || ' Co ' || g, ${P}, ${appt}, 'appt', now() from generate_series(1, 2) g`);
// The agent's calls today: three at 9, one at 2.
const at = (h) => `(('${today}'::date + time '${h}:10')::timestamp at time zone public.business_tz())`;
sql(`insert into public.call_records (user_id, project_id, call_date, notes) values
  (${AGENT}, ${P}, ${at(9)}, ${lit(TAG)}), (${AGENT}, ${P}, ${at(9)}, ${lit(TAG)}), (${AGENT}, ${P}, ${at(9)}, ${lit(TAG)}), (${AGENT}, ${P}, ${at(14)}, ${lit(TAG)})`);

const browser = await launchBrowser();
// Read once the page has it: a page is compiled on first visit in development, which can take a while.
const when = (page, expr, timeout = 20000) => until(() => page.ev(expr), { timeout });
const upload = async (page, selector) => {
  const { root } = await page.send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await page.send("DOM.querySelector", { nodeId: root.nodeId, selector });
  await page.send("DOM.setFileInputFiles", { nodeId, files: [PICTURE] });
};
try {
  const agent = await (await browser.newContext({ as: "agent@beacon.test" })).newPage({ width: 1440, height: 950 });
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1440, height: 950 });
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 950 });

  section("A photo and a line about themselves");
  await agent.go("/security", 4000);
  check("My Security has My Photo for staff", Boolean(await until(() => agent.ev("!!document.querySelector('[data-my-photo] [data-picture-upload=photo]')"), { timeout: 20000 })));
  await upload(agent, "[data-my-photo] [data-picture-file]");
  const photo = await until(() => sql(`select coalesce(photo_path, '') from public.users where id=${AGENT}`) || null, { timeout: 10000 });
  check("uploaded: kept as their own picture", new RegExp(`^user/${AGENT}/[a-z0-9]+\\.(webp|jpg)$`).test(photo ?? ""), photo);
  check("…and shown in the sidebar beside their name", Boolean(await until(() => agent.ev("!!document.querySelector('[data-my-avatar]')"), { timeout: 8000 })));
  check("…to anyone at its public address", (await agent.ev(`fetch(document.querySelector('[data-my-photo] [data-picture]')?.src).then((r) => r.ok)`)) === true);
  await agent.fill("[data-profile-form] [data-bio]", `${TAG} Ten years on the phones`);
  await agent.click("[data-profile-form] button[type=submit]", "Save");
  check("their line saves with their details", Boolean(await until(() => sql(`select bio from public.users where id=${AGENT}`) === `${TAG} Ten years on the phones` || null)));

  section("Meet the Team");
  await client.go("/team", 4000);
  const mine = (await when(client, "document.querySelector('[data-team-group=mine]')?.innerText")) ?? "";
  check("a client sees first those who work their projects, photo and line", mine.includes("Ten years on the phones")
    && Boolean(await client.ev(`!!document.querySelector('[data-team-group=mine] [data-team-member="${AGENT}"] img')`)), mine.slice(0, 200));
  check("…the rest of the team after", Boolean(await client.ev("!!document.querySelector('[data-team-group=rest] [data-team-member]')")));
  check("…no emails or phone numbers", !/@beacon\.test/.test(await client.ev("document.querySelector('main')?.innerText ?? document.body.innerText")));
  await client.fill("[data-team-search]", "zzzz-nobody");
  check("a name to look for narrows it", Boolean(await until(() => client.ev("!document.querySelector('[data-team-member]')"))));

  section("A client's branding");
  await client.go("/branding", 4000);
  await when(client, "!!document.querySelector('[data-branding-logo] [data-picture-file]')");
  await upload(client, "[data-branding-logo] [data-picture-file]");
  const logo = await until(() => sql(`select coalesce(logo_path, '') from public.companies where id=${company}`) || null, { timeout: 10000 });
  check("their logo, kept as their company's", new RegExp(`^company/${company}/[a-z0-9]+\\.(webp|png)$`).test(logo ?? ""), logo);
  check("…and in their workspace, under ours", Boolean(await until(() => client.ev("!!document.querySelector('[data-client-logo] img')"), { timeout: 8000 })));
  await client.fill("[data-website-form] input[name=website]", "not a website");
  await client.click("[data-website-form] button[type=submit]", "Save");
  check("a website that is not one is refused", Boolean(await until(() => client.ev("/does not look right/i.test(document.querySelector('[data-website-form]')?.innerText ?? '')"))));
  await client.fill("[data-website-form] input[name=website]", "www.example-agency.com");
  await client.click("[data-website-form] button[type=submit]", "Save");
  check("…one that is, saved with https://", Boolean(await until(() => sql(`select coalesce(website, '') from public.companies where id=${company}`) === "https://www.example-agency.com" || null)));

  // Pictures go only where they belong: a client's people, their own company's folder; nobody else's photo.
  // One psql command is one transaction: the role and claims last only for it, and only its last answer is printed.
  const clientAuth = sql(`select auth_id from public.users where id = ${CLIENT}`);
  const asClient = (q) => sql(`set local role authenticated;
    select set_config('request.jwt.claims', json_build_object('sub', '${clientAuth}', 'role', 'authenticated')::text, true);
    ${q}`).split("\n").at(-1);
  check("a client may add pictures to their own company's folder only", asClient(`select public.can_write_image('company/${company}/x.webp')`) === "t"
    && asClient(`select public.can_write_image('company/${company + 1}/x.webp')`) === "f" && asClient(`select public.can_write_image('user/${AGENT}/x.webp')`) === "f");

  section("Appointments, for a client");
  await client.go("/appointments", 4000);
  await when(client, "!!document.querySelector('[data-appointment-list]')");
  check("no New appointment for a client: appointments are ours to set", !(await client.ev("[...document.querySelectorAll('[data-appointment-list] button')].some((b) => /New appointment/i.test(b.textContent))")));
  await admin.go("/appointments", 4000);
  check("…staff still book one by hand", Boolean(await when(admin, "[...document.querySelectorAll('[data-appointment-list] button')].some((b) => /New appointment/i.test(b.textContent))")));

  section("Their subscription, near its end");
  await client.go("/", 5000);
  const notice = (await when(client, "document.querySelector('[data-subscription-notice]')?.innerText")) ?? "";
  check("the client's dashboard warns them, ten days out", /subscription ends in 10 days/i.test(notice), notice);
  sql(`update public.companies set subscription_end = '${today}'::date + 60 where id = ${company}`);
  await client.go("/", 5000);
  check("…not two months out", !(await client.ev("!!document.querySelector('[data-subscription-notice]')")));
  sql(`update public.companies set subscription_end = '${today}'::date - 3 where id = ${company}`);
  await client.go("/", 5000);
  check("…and says when it has ended", /ended 3 days ago/i.test((await when(client, "document.querySelector('[data-subscription-notice]')?.innerText")) ?? ""));

  section("The client's page, for an administrator");
  await admin.go("/clients", 3000);
  const link = await admin.ev(`[...document.querySelectorAll('a[href^="/clients/"]')].find((a) => a.textContent.includes(${JSON.stringify(`${TAG} Insurance`)}))?.getAttribute('href')`);
  await admin.go(link, 5000);
  await when(admin, "!!document.querySelector('[data-client-branding]')");
  check("its logo heads the page, with Branding to change it", Boolean(await when(admin, "!!document.querySelector('[data-client-branding] [data-picture]')")));
  check("…and its subscription's end is flagged", /Subscription ended 3 days ago/i.test((await when(admin, "document.querySelector('[data-subscription-notice]')?.innerText")) ?? ""));

  section("Project goals");
  await admin.go(`/projects/${P}`, 5000);
  const goals = (await when(admin, "document.querySelector('[data-project-goals]')?.innerText.replace(/\\s+/g, ' ')")) ?? "";
  check("the project shows its goals: delivered, owed, behind pace", /Leads 2 of 40/.test(goals) && /38 still owed/.test(goals) && /behind pace/.test(goals), goals);
  check("…its appointments against theirs", /Appointments 2 of 10/.test(goals), goals);
  check("…days passed and to go", /10 days passed/.test(goals) && /20 days to go/.test(goals), goals);
  await admin.click("button", "Edit");
  check("the project form takes the goals, as saved", Boolean(await when(admin, "document.querySelector('input[name=lead_goal]')?.value === '40' && document.querySelector('input[name=appt_goal]')?.value === '10'")));
  await admin.ev("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), true");
  // A goal a month (Sean, Oct 2026): the average a month against it, and this month so far; and the
  // overall goal from it when none is set (a 30-day project: one month, so 5).
  sql(`update public.projects set lead_goal_month = 5 where id = ${P}`);
  await admin.go(`/projects/${P}`, 5000);
  const monthly = (await when(admin, "document.querySelector('[data-goal=\"Leads\"] [data-goal-month]')?.innerText.replace(/\\s+/g, ' ')")) ?? "";
  check("a goal a month: the average a month against it, and this month so far", /Avg 2 a month · goal 5 · behind/.test(monthly) && /This month 0 of 5/.test(monthly), monthly);
  sql(`update public.projects set lead_goal = null where id = ${P}`);
  await admin.go(`/projects/${P}`, 5000);
  check("…the overall goal from it when none is set", /Leads 2 of 5/.test((await when(admin, "document.querySelector('[data-project-goals]')?.innerText.replace(/\\s+/g, ' ')")) ?? ""));
  sql(`update public.projects set lead_goal = 40, lead_goal_month = null where id = ${P}`);
  // A month's bar on X-Dates by Month, from the project: back to it (Sean, Oct 2026).
  await admin.go(`/reports/x-dates?project=${P}&month=1#names`, 5000);
  check("X-Dates by Month, opened from a project, goes back to it", (await when(admin, "document.querySelector('[data-back-to-project]')?.getAttribute('href')")) === `/projects/${P}`);
  await admin.go("/reports/goals", 5000);
  const row = (await when(admin, `document.querySelector('[data-goal-row="${P}"]')?.innerText.replace(/\\s+/g, ' ')`)) ?? "";
  check("Project Goals lists it, behind pace", /Behind/.test(row) && /38 still owed/.test(row) && /20 days to go/.test(row), row);
  check("…behind-pace projects first", (await admin.ev("document.querySelector('[data-goal-row]')?.dataset.goalRow")) === String(P)
    || /Behind/.test(await admin.ev("document.querySelector('[data-goal-row]')?.innerText ?? ''")));

  section("Hourly Progress");
  await agent.go("/reports/hourly", 5000);
  const bar = (page, h) => page.ev(`document.querySelector('[data-hourly-chart] [data-hour="${h}"]')?.dataset.calls`);
  await when(agent, "!!document.querySelector('[data-hourly-chart]')");
  check("an agent's own day by the hour: three calls at 9, one at 2", (await bar(agent, 9)) === "3" && (await bar(agent, 14)) === "1" && (await bar(agent, 11)) === "0");
  check("…with the day's calls added up", /^Calls\s*4/.test(await agent.ev(`document.querySelector('[data-hourly-figure="Calls"]')?.innerText ?? ''`)));
  check("…and the month so far", /4 calls|[1-9]\d* calls/.test(await agent.ev("document.querySelector('[data-hourly-month]')?.innerText ?? ''")));
  const SEAN = sql("select id from public.users where email='sean@beacon.test'");
  await agent.go(`/reports/hourly?user=${SEAN}`, 4000);
  check("an agent asking for someone else's still sees their own", Boolean(await until(async () => (await bar(agent, 9)) === "3", { timeout: 20000 })));
  await admin.go(`/reports/hourly?user=${AGENT}`, 5000);
  check("an administrator picks anyone's", Boolean(await until(async () => (await bar(admin, 9)) === "3", { timeout: 20000 })));
  await admin.go(`/reports/hourly?user=${AGENT}&day=${sql(`select '${today}'::date - 1`)}`, 4000);
  check("…on any day before", Boolean(await until(async () => (await bar(admin, 9)) === "0", { timeout: 20000 })));
  // The title and the day field always say the same day, however it was reached.
  const shown = () => admin.ev(`({ title: document.querySelector('[data-topbar-title]')?.parentElement?.parentElement?.querySelector('p')?.textContent ?? '',
    field: document.querySelector('[data-hourly-day] input[name=day]')?.value ?? '', url: new URLSearchParams(location.search).get('day') })`);
  const agree = (s, iso) => s.field === iso && s.title.endsWith(formatIso(iso, "long")) && (s.url ?? today) === iso;
  const yesterday = sql(`select '${today}'::date - 1`);
  check("the day before: title and field agree", agree(await shown(), yesterday), JSON.stringify(await shown()));
  await admin.click('a[aria-label="The day after"]');
  check("the arrow on to today: both say today", Boolean(await until(async () => agree(await shown(), today), { timeout: 20000 })), JSON.stringify(await shown()));
  const twoBack = sql(`select '${today}'::date - 2`);
  await admin.fill('[data-hourly-day] input[aria-label="Day"]', `${Number(twoBack.slice(5, 7))}/${Number(twoBack.slice(8, 10))}/${twoBack.slice(0, 4)}`);
  await admin.key("Enter");
  check("a day typed in the field: shown at once, no Show button, the title with it", Boolean(await until(async () => agree(await shown(), twoBack), { timeout: 20000 }))
    && !(await admin.ev("[...document.querySelectorAll('[data-hourly-day] ~ button, form[data-hourly-day] button')].some((b) => b.textContent.trim() === 'Show')")), JSON.stringify(await shown()));

  section("A note on a calendar's time");
  await client.go(`/calendar?project=${P}&view=month&d=${today}`, 6000);
  await until(() => client.ev("!!document.querySelector('[data-calendar-picker] [data-add-note]')"), { timeout: 20000 });
  await client.click("[data-calendar-picker] [data-add-note]", "Add note");
  await until(() => client.ev("!!document.querySelector('[data-note-form]')"));
  await client.fill("[data-note-form] select[name=at_time]", "2:00 PM");
  await client.fill("[data-note-form] [data-note-body]", `${TAG} Owner back at 2`);
  await client.click("[data-note-form] button[type=submit]", "Add note");
  const noteId = await until(() => sql(`select coalesce(max(id)::text, '') from public.calendar_notes where body = ${lit(`${TAG} Owner back at 2`)}`) || null);
  check("the client adds a note at 2 PM", Boolean(noteId) && sql(`select at_time::text from public.calendar_notes where id = ${noteId}`) === "14:00:00");
  await client.go(`/calendar?project=${P}&view=day&d=${today}`, 6000);
  check("…on the day's grid at its time", Boolean(await until(() => client.ev(`!!document.querySelector('[data-calendar-note="${noteId}"]')`))));
  check("…without blocking the time", sql(`select count(*) from public.calendar_blocks where project_id = ${P}`) === "0");
  await admin.go(`/calendar?project=${P}&view=month&d=${today}`, 6000);
  check("staff see it on the month: its day marked", Boolean(await until(() => admin.ev("!!document.querySelector('[data-day-noted]')"), { timeout: 20000 })));
  await admin.go(`/projects/${P}`, 5000);
  sql(`delete from public.calendar_notes where id = ${noteId}`);
  await sleep(100);
} finally {
  browser.close();
  const like = lit(`${TAG}%`);
  sql(`update public.users set company_id = ${clientCompany}, photo_path = null where id = ${CLIENT}`);
  sql(`update public.users set photo_path = ${agentBefore.photo ? lit(agentBefore.photo) : "null"}, bio = ${agentBefore.bio ? lit(agentBefore.bio) : "null"} where id = ${AGENT}`);
  // The pictures uploaded here, through the Storage API (the bucket's rows are not to be deleted directly).
  const added = sql(`select coalesce(string_agg(name, ','), '') from storage.objects where bucket_id = 'public-images'
    and (name like 'company/${company}/%' or (name like 'user/${AGENT}/%' and name <> ${lit(agentBefore.photo ?? "")}))`);
  if (added) await adminClient().storage.from("public-images").remove(added.split(","));
  sql(`delete from public.calendar_notes where project_id = ${P}`);
  sql(`delete from public.call_records where notes = ${lit(TAG)}`);
  sql(`delete from public.leads where company_name like ${like}`);
  sql(`delete from public.project_assignments where project_id = ${P}`);
  sql(`delete from public.projects where id = ${P}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("old system features");
