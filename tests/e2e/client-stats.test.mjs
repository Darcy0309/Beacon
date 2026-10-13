/**
 * The client's page and a project's page, counted by call result (Sean, Oct
 * 2026): Leads (active and resolved), Appointments (and invalid),
 * Conversions in place of Campaigns, a Client Calendar; each project's
 * figures and dates in the list; and on a project, the same tiles for it,
 * its calendar (a DB dev project's shared with its appointment project)
 * and its call results graphed.
 *
 * Removes everything it made.
 *
 *   node tests/e2e/client-stats.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `CSE ${Date.now()}`;
const NAME = `${TAG} Insurance`;
const type = (code) => sql(`select id from public.project_types where code='${code}'`);
const result = (t, name) => Number(sql(`select id from public.call_results where project_type='${t}' and name=${lit(name)}`));
const today = sql("select ((now() at time zone public.business_tz())::date)::text");
const company = Number(sql(`insert into public.companies (name) values (${lit(NAME)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, start_date, end_date)
  values (${lit(`${TAG} Appts`)}, ${company}, ${type("APPT")}, 1, '2026-01-28', '2026-12-31') returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id, start_date, end_date)
  values (${lit(`${TAG} DBDev`)}, ${company}, ${type("DBDV")}, 1, ${APPT}, '2026-01-28', '2026-12-31') returning id`));
for (const name of ["Viable-CallBack", "Viable-CallBack", "Pending", "Not Interested"])
  sql(`insert into public.leads (company_name, project_id, result_id) values (${lit(`${TAG} ${name}`)}, ${DBDV}, ${result("DBDV", name)})`);
const sent = (dbdv, now) => Number(sql(`insert into public.leads (company_name, project_id, source_project_id, stage, promoted_at, call_result_dbdv, result_id)
  values (${lit(`${TAG} sent ${now}`)}, ${APPT}, ${DBDV}, 'appt', now(), ${lit(dbdv)}, ${result("APPT", now)}) returning id`));
sent("Lead", "Lead-No Contact");
sent("Lead", "Lead-Removed");
const booked = sent("Appointment", "Appointment");
sent("Appointment", "Appointment-Invalid");
// An appointment today, on the appointment project's calendar (where DB dev's go too).
sql(`insert into public.appointments (lead_id, project_id, set_project_id, appt_date, appt_time, status_id)
  values (${booked}, ${APPT}, ${DBDV}, ${lit(today)}, '10:00 AM', (select id from public.appointment_statuses where name='Scheduled'))`);

// Time blocked out: today on the appointment project's calendar, entered on the DB dev project (which shares it);
// and all month on another client's project, which this client's calendar must not show.
sql(`insert into public.calendar_blocks (project_id, starts_on, ends_on, note) values (${DBDV}, ${lit(today)}, ${lit(today)}, 'Office closed')`);
const otherCompany = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Other Agency`)}) returning id`));
const OTHER = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Other Appts`)}, ${otherCompany}, ${type("APPT")}, 1) returning id`));
sql(`insert into public.calendar_blocks (project_id, starts_on, ends_on, note) values (${OTHER}, date_trunc('month', ${lit(today)}::date)::date, (date_trunc('month', ${lit(today)}::date) + interval '1 month - 1 day')::date, 'Not theirs')`);

const CLIENT_USER = Number(sql("select id from public.users where email='client@beacon.test'"));
const clientCompany = sql(`select coalesce(company_id::text, 'null') from public.users where id=${CLIENT_USER}`);

const slug = NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const browser = await launchBrowser();
const tile = (page, label) => page.ev(`[...document.querySelectorAll('[data-panel]')].find((p) => p.querySelector('.stat-label')?.textContent.trim().toLowerCase() === ${JSON.stringify(label.toLowerCase())})?.innerText.replace(/\\s+/g, ' ') ?? null`);
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });

  section("The client's page");
  await admin.go(`/clients/${slug}`, 5000);
  const labels = await until(() => admin.ev(`[...document.querySelectorAll('[data-panel] .stat-label')].map((e) => e.textContent.trim())`).then((l) => l.length >= 4 && l));
  check("Leads, Appointments, Conversions and a Client Calendar (no Active Leads, no Campaigns)",
    JSON.stringify(labels) === JSON.stringify(["Leads", "Appointments", "Conversions", "Client Calendar"]), JSON.stringify(labels));
  check("Leads: the names at the appointment stage, active and resolved", Boolean(await until(async () => /Leads 4 1 active · 3 resolved/i.test((await tile(admin, "Leads")) ?? ""))), await tile(admin, "Leads"));
  check("Appointments: by call result, the invalid apart", /Appointments 1 1 invalid/i.test((await tile(admin, "Appointments")) ?? ""), await tile(admin, "Appointments"));
  const conv = await tile(admin, "Conversions");
  check("Conversions: names to leads, leads to appointments, and what they are counted from",
    /50% of names became leads/i.test(conv) && /50% of leads became appointments/i.test(conv) && /8 names · 4 leads developed · 2 appointments/.test(conv), conv);
  check("the calendar marks today's appointment", (await admin.ev(`document.querySelector('[data-calendar-tile] [data-tile-day="${today}"]')?.dataset.count`)) === "1");
  const rows = await admin.ev(`[...document.querySelectorAll('[data-client-project]')].map((r) => r.innerText.replace(/\\s+/g, ' '))`);
  const dbdvRow = rows.find((r) => r.includes(`${TAG} DBDev`)) ?? "";
  check("each project's figures run across its row", /8 names/.test(dbdvRow) && /3 left to call/.test(dbdvRow) && /4 leads \(1 active, 3 resolved\)/.test(dbdvRow) && /1 appointment, 1 invalid/.test(dbdvRow) && /50% names to leads/.test(dbdvRow), dbdvRow);
  check("…with its start and end dates by the status", /Jan 28, 2026 – Dec 31, 2026 ACTIVE/i.test(dbdvRow), dbdvRow);
  await admin.click(`[data-calendar-tile] [data-tile-day="${today}"]`);
  check("a day opens the calendar, kept to this client",
    Boolean(await until(async () => (await admin.url()).includes(`client=${company}`) && /all projects/.test((await admin.ev(`document.querySelector('[data-calendar-scope]')?.innerText`)) ?? ""))), await admin.url());
  check("…with its appointment, and no other client's", await admin.ev(`document.body.innerText.includes(${JSON.stringify(`${TAG} sent Appointment`)})`) && /1 appointment(?!s)/.test(await admin.ev(`document.querySelector('header, [data-topbar]')?.innerText ?? document.body.innerText`)));

  section("The client's calendar, opened in full");
  check("the tile marks the day blocked out", (await admin.go(`/clients/${slug}`, 5000), Boolean(await until(() => admin.ev(`document.querySelector('[data-calendar-tile] [data-tile-day="${today}"]')?.dataset.blocked === 'day'`)))));
  await admin.click("[data-calendar-tile] [data-open-calendar]");
  const blockedCells = () => admin.ev(`[...document.querySelectorAll('button[data-blocked]')].map((b) => b.dataset.blocked + ':' + b.querySelector('span span')?.textContent.trim())`);
  check("“Open” shows the month with the same day blocked out, and no other client's",
    Boolean(await until(async () => (await admin.url()).includes(`client=${company}`) && JSON.stringify(await blockedCells()) === JSON.stringify([`day:${Number(today.slice(8))}`]))), JSON.stringify(await blockedCells()));
  const bar = (await admin.ev(`document.querySelector('[data-blocked-time]')?.innerText.replace(/\\s+/g, ' ') ?? ''`)) ?? "";
  check("…the block listed with its project, the one whose calendar it is on", bar.includes("All day · Office closed") && bar.includes(`${TAG} Appts`) && !bar.includes("Not theirs"), bar);
  check("…to look at: a project is chosen to add or take one off", /Choose a project to block out time/.test(bar)
    && (await admin.ev(`document.querySelectorAll('[data-blocked-time] [data-remove-block], [data-blocked-time] [data-block-out]').length`)) === 0);
  await admin.go(`/calendar?view=month&d=${today}`, 4000);
  check("every client's calendars together show no blocked time: a project or client is chosen for that", (await blockedCells()).length === 0 && !(await admin.ev(`!!document.querySelector('[data-blocked-time]')`)));

  section("A client with more than one calendar");
  // Their own calendars together are their client calendar: its blocked time shows without choosing one.
  sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts West`)}, ${company}, ${type("APPT")}, 1)`);
  sql(`update public.users set company_id = ${company} where id = ${CLIENT_USER}`);
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await client.go(`/calendar?view=month&d=${today}`, 5000);
  const theirs = await until(() => client.ev(`[...document.querySelectorAll('button[data-blocked]')].map((b) => b.dataset.blocked + ':' + b.querySelector('span span')?.textContent.trim())`).then((l) => l.length && l));
  check("the month shades the day blocked out on either", JSON.stringify(theirs) === JSON.stringify([`day:${Number(today.slice(8))}`]), JSON.stringify(theirs));
  check("…and lists it with its project", ((await client.ev(`document.querySelector('[data-blocked-time]')?.innerText`)) ?? "").includes(`${TAG} Appts`));
  client.close();

  section("A DB dev project's page");
  await admin.go(`/projects/${DBDV}`, 5000);
  const dl = await until(() => admin.ev(`[...document.querySelectorAll('[data-panel] .stat-label')].map((e) => e.textContent.trim())`).then((l) => l.length >= 6 && l));
  check("Names Left to Call, Leads, Appointments, Conversions, Calls This Month and its calendar",
    JSON.stringify(dl) === JSON.stringify(["Names Left to Call", "Leads", "Appointments", "Conversions", "Calls This Month", "Project Calendar"]), JSON.stringify(dl));
  check("names left to call counts those pending too", Boolean(await until(async () => /Names Left to Call 3 of 8 names/i.test((await tile(admin, "Names Left to Call")) ?? ""))), await tile(admin, "Names Left to Call"));
  check("its calendar is the appointment project's, and says so",
    /Shared with .* Appts/.test((await admin.ev(`document.querySelector('[data-calendar-tile]')?.innerText`)) ?? "")
    && (await admin.ev(`document.querySelector('[data-calendar-tile] [data-tile-day="${today}"]')?.dataset.count`)) === "1");
  const graph = await admin.ev(`[...document.querySelectorAll('[data-result-breakdown] [data-result-row]')].map((r) => r.innerText.replace(/\\s+/g, ' '))`);
  check("its call results as a circle, a slice a result, the names in the middle",
    await admin.ev(`(() => { const c = document.querySelector('[data-result-chart]'); return !!c && c.querySelectorAll('[data-slice]').length === 5 && [...c.querySelectorAll('text')].map((t) => t.textContent).join(' ') === '8 names'; })()`),
    await admin.ev(`document.querySelector('[data-result-chart]')?.textContent`));
  check("…each listed with how many and what share", graph.some((r) => /^Viable-CallBack 2 25%/.test(r)) && graph.some((r) => /^Lead 2 25%/.test(r)) && graph.some((r) => /^Appointment 2 25%/.test(r)), JSON.stringify(graph));

  section("An appointment project's page");
  await admin.go(`/projects/${APPT}`, 5000);
  const al = await until(() => admin.ev(`[...document.querySelectorAll('[data-panel] .stat-label')].map((e) => e.textContent.trim())`).then((l) => l.length >= 5 && l));
  check("the same, without Names Left to Call", JSON.stringify(al) === JSON.stringify(["Leads", "Appointments", "Conversions", "Calls This Month", "Project Calendar"]), JSON.stringify(al));
  check("its graph is by appointment result", await admin.ev(`[...document.querySelectorAll('[data-result-breakdown] [data-result-row]')].some((r) => r.dataset.resultRow === 'Appointment-Invalid')`));
} finally {
  browser.close();
  sql(`delete from public.leads where company_name like ${lit(`${TAG}%`)}`);
  sql(`update public.users set company_id = ${clientCompany} where id = ${CLIENT_USER}`);
  sql(`delete from public.projects where id in (${DBDV}, ${APPT}, ${OTHER}) or name = ${lit(`${TAG} Appts West`)}`);
  sql(`delete from public.companies where id in (${company}, ${otherCompany})`);
}

finish("client stats (browser)");
