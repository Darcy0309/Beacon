/**
 * A client's dashboard, top row (Sean, Oct 2026): Leads Developed (leads,
 * never the names still to call; each DB dev project with the leads it
 * developed), formerly every name
 * on their projects, whatever its result) with each project's count, over 1
 * week to all time; Appointments Set as a share of those leads; Appointment
 * Results as the client records them; and Upcoming Pipeline, the viable
 * leads renewing in each of the next 3 or 6 months (not this one). An
 * administrator sees the last two on the client's page.
 *
 *   npm run test:e2e
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `CD-TEST ${Date.now()}`;
const CLIENT = Number(sql("select id from public.users where email='client@beacon.test'"));
const clientCompany = sql(`select coalesce(company_id::text, 'null') from public.users where id=${CLIENT}`);
const typeId = (c) => sql(`select id from public.project_types where code=${lit(c)}`);
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const slug = sql(`select lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) from public.companies where id = ${company}`).replace(/^-|-$/g, "");
const P1 = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Churches`)}, ${company}, ${typeId("APPT")}, 1) returning id`));
const P2 = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Contractors`)}, ${company}, ${typeId("APPT")}, 1) returning id`));
sql(`update public.users set company_id = ${company} where id = ${CLIENT}`);
const viable = sql("select id from public.call_results where project_type = 'APPT' and viable order by id limit 1");
// Off the list, and not an appointment of any kind (Lead-Removed and the like).
const off = sql("select id from public.call_results where project_type = 'APPT' and not viable and coalesce(effect, 'none') not in ('appointment', 'confirm', 'appointment_invalid') order by id limit 1");
// Six names on the first project (two of them dated two months back), three on the second.
const leadsOn = (p, n, back = 0, result = viable) => sql(`insert into public.leads (company_name, project_id, result_id, lead_date)
  select ${lit(TAG)} || ' Co ' || g, ${p}, ${result}, now() - interval '${back} days' from generate_series(1, ${n}) g`);
leadsOn(P1, 4); leadsOn(P1, 2, 60); leadsOn(P2, 2); leadsOn(P2, 1, 0, off);
// A DB dev list tied to the first: twelve names still to call (never counted as leads), and the four
// recent leads on the first project developed from it.
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id) values (${lit(`${TAG} Maricopa DBDev`)}, ${company}, ${typeId("DBDV")}, 1, ${P1}) returning id`));
sql(`insert into public.leads (company_name, project_id) select ${lit(TAG)} || ' Name ' || g, ${DBDV} from generate_series(1, 12) g`);
sql(`update public.leads set source_project_id = ${DBDV}, promoted_at = now() where id in (select id from public.leads where project_id = ${P1} and lead_date > now() - interval '1 day' order by id limit 4)`);
// Renewals: two viable names next month, one the month after; next month too, a not-viable name and an
// appointment (neither counted: the X-Dates report's Viable left).
const month = (n) => sql(`select (date_trunc('month', now() at time zone public.business_tz()) + interval '${n} month')::date + 9`);
const ids = sql(`select string_agg(id::text, ',' order by id) from public.leads where company_name like ${lit(`${TAG}%`)}`).split(",").map(Number);
const lastId = Number(sql(`select max(id) from public.leads where company_name like ${lit(`${TAG}%`)} and result_id = ${off}`));
// Four appointments by their names' results: three set, one invalid.
const resultNamed = (name) => sql(`select id from public.call_results where project_type = 'APPT' and name = ${lit(name)}`);
sql(`update public.leads set result_id = ${resultNamed("Appointment")} where id in (${ids[0]}, ${ids[1]}, ${ids[2]})`);
sql(`update public.leads set result_id = ${resultNamed("Appointment-Invalid")} where id = ${ids[3]}`);
sql(`insert into public.insurance_details (lead_id, ultimate_xdate) values (${ids[4]}, '${month(1)}'), (${ids[5]}, '${month(1)}'), (${ids[6]}, '${month(2)}'),
  (${lastId}, '${month(1)}'), (${ids[0]}, '${month(1)}')`);
// Three appointments set, as the client sees them (through QA): one quoting, one sold.
// The quoting one quoted at $50,000; the sold one written at $30,000, this month.
for (const [i, result, quoted, written] of [[0, null, null, null], [1, "quoting", 50000, null], [2, "sold", 32000, 30000]]) {
  sql(`insert into public.appointments (lead_id, project_id, appt_date, appt_time, qa_status, client_result, quoted_premium, written_premium, client_result_at)
    values (${ids[i]}, ${P1}, current_date + 3, '10:00 AM', 'passed', ${result ? lit(result) : "null"}, ${quoted ?? "null"}, ${written ?? "null"}, ${result ? "now()" : "null"})`);
}

// Developed: two leads (one a week and a half ago), and the sold one set as an appointment, confirmed.
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
sql(`update public.appointments set confirmed_at = now(), rep_name = 'Josh Huray' where lead_id = ${ids[2]}`);
const apptId = sql(`select id from public.appointments where lead_id = ${ids[2]}`);
sql(`insert into public.pay_events (user_id, project_id, lead_id, kind, amount, created_at) values
  (${SEAN}, ${P1}, ${ids[0]}, 'lead', 12, now() - interval '1 hour'),
  (${SEAN}, ${P2}, ${ids[6]}, 'lead', 12, now() - interval '10 days')`);
sql(`insert into public.pay_events (user_id, project_id, lead_id, appointment_id, kind, amount) values (${SEAN}, ${P1}, ${ids[2]}, ${apptId}, 'appointment', 40)`);
sql(`insert into public.lead_notes (lead_id, notes) values (${ids[2]}, ${lit(`${TAG} INTERNAL call after 3pm`)})`);
sql(`update public.leads set client_note = ${lit(`${TAG} owner prefers mornings`)} where id = ${ids[2]}`);

const browser = await launchBrowser();
const tile = (page, label) => page.ev(`(() => { const t = [...document.querySelectorAll('[data-panel]')].find((x) => x.querySelector('.stat-label')?.textContent.trim().toLowerCase() === ${JSON.stringify(label.toLowerCase())});
  return t ? t.innerText.replace(/\\s+/g, ' ') : null; })()`);
try {
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1440, height: 950 });

  section("Leads Developed, all time to begin with");
  await client.go("/", 4000);
  const leads = await tile(client, "Leads Developed");
  check("the leads on their projects, not the names still to call", /Leads Developed 9\b/.test(leads ?? ""), leads);
  check("…with each DB dev project and the leads it developed (no appointment projects listed)", /Maricopa DBDev 4\b/.test(leads ?? "") && !/Churches|Contractors/.test(leads ?? ""), leads);
  const appts = await tile(client, "Appointments Set");
  check("Appointments Set: the names whose result is an appointment (invalid too), as a share of the leads", /Appointments Set 4\b/.test(appts ?? "") && /44\.4% of leads/.test(appts ?? ""), appts);

  section("Over one month");
  await client.go("/?cp=1m", 4000);
  check("the leads from two months back drop out", /Leads Developed 7\b/.test((await tile(client, "Leads Developed")) ?? "") && /Maricopa DBDev 4\b/.test((await tile(client, "Leads Developed")) ?? ""),
    await tile(client, "Leads Developed"));

  section("Appointment Results");
  const results = await client.ev(`Object.fromEntries([...document.querySelectorAll('[data-client-result]')].map((r) => [r.dataset.clientResult, r.innerText.replace(/\\s+/g, ' ')]))`);
  check("each outcome with its count, Pending until the client updates it; Invalid for an Appointment-Invalid name",
    /Pending 1/.test(results.pending) && /Quoting 1/.test(results.quoting) && /Sold Account 1/.test(results.sold)
    && /Quoted-Not Sold 0/.test(results.quoted_not_sold) && /Valid-Not Quoting 0/.test(results.valid_not_quoting) && /Invalid Appointment 1/.test(results.invalid), JSON.stringify(results));

  section("Upcoming Pipeline");
  const months = () => client.ev(`[...document.querySelectorAll('[data-pipeline-month]')].map((m) => m.innerText.replace(/\\s+/g, ' '))`);
  const ahead = await months();
  const label = (n) => sql(`select to_char(date_trunc('month', now() at time zone public.business_tz()) + interval '${n} month', 'Mon')`);
  check("the next three months, not this one: viable leads renewing in each", ahead.length === 3 && ahead[0] === `${label(1)} 2` && ahead[1] === `${label(2)} 1` && ahead[2] === `${label(3)} 0`, JSON.stringify(ahead));
  await client.go("/?up=6", 4000);
  check("…or six", (await months()).length === 6, JSON.stringify(await months()));

  section("Row two: the Sale Pipeline");
  await client.go("/", 4000);
  const stat = (k) => client.ev(`document.querySelector('[data-sale-stat="${k}"]')?.innerText.replace(/\\s+/g, ' ')`);
  check("premium written this year, in the pipe, and the close ratio (sold of pending, quoting, quoted-not sold and sold)",
    /\$30,000/.test((await stat("written")) ?? "") && /\$50,000/.test((await stat("pipe")) ?? "") && /33\.3%/.test((await stat("close")) ?? "") && /1 sold of 3/.test((await stat("close")) ?? ""),
    JSON.stringify([await stat("written"), await stat("pipe"), await stat("close")]));
  check("…drawn like a ticker", Boolean(await client.ev("!!document.querySelector('[data-sale-pipeline] [data-ticker]')")));
  check("…the goal not set yet", /Not set/.test((await stat("goal")) ?? ""), await stat("goal"));
  await client.click("[data-set-goal]");
  await until(() => client.ev("!!document.querySelector('[data-goal-input]')"));
  await client.fill("[data-goal-input]", "120,000");
  await client.click("[data-save-goal]");
  check("the client sets their goal for the year", Boolean(await until(async () => /\$120,000/.test((await stat("goal")) ?? ""), { timeout: 10000 }))
    && /25% of it written/.test((await stat("goal")) ?? "") && Boolean(await client.ev("!!document.querySelector('[data-goal-pace]')")), await stat("goal"));
  if (process.env.SHOTS) {
    await client.ev("document.querySelector('[data-client-row-two]').scrollIntoView({ block: 'start' })");
    await client.screenshot(`${process.env.SHOTS}/client-row-two.png`);
  }

  section("Row two: their calendar, as a manager's");
  const days = await client.ev("document.querySelectorAll('[data-client-row-two] [data-my-schedule] [data-day]').length");
  check("the full month beside the day", days >= 28, String(days));
  const apptDay = sql("select (current_date + 3)::text");
  await client.ev(`document.querySelector('[data-client-row-two] [data-day="${apptDay}"]')?.click()`);
  const listed = await until(() => client.ev(`[...document.querySelectorAll('[data-client-row-two] [data-schedule-item]')].map((i) => i.innerText.replace(/\\s+/g, ' ')).join(' | ') || null`));
  check("…with their appointments, to open", /CD-TEST .* Co /.test(listed ?? "") && Boolean(await client.ev("!!document.querySelector('[data-client-row-two] [data-schedule-item] a[href], [data-client-row-two] a[data-schedule-item]')")), listed);
  check("…nothing to drag about: theirs to open, not to move", !(await client.ev("!!document.querySelector('[data-client-row-two] [draggable=true]')")));

  section("Row three: Recent Activity, the last week to begin with");
  await client.go("/", 4000);
  const rows = () => client.ev(`[...document.querySelectorAll('[data-activity-row]')].map((r) => [...r.cells].map((c) => c.innerText.replace(/\\s+/g, ' ')).join(' | '))`);
  let act = await rows();
  check("the leads and appointments developed this week, newest first", act.length === 2 && /Appointment-Confirmed/.test(act[0]) && /\| Lead \|/.test(act[1]), JSON.stringify(act));
  check("…company and city, project, agent, when, result, X-date and manager", /Churches/.test(act[0]) && /Josh Huray/.test(act[0]) && /Sean/.test(act[0]), act[0]);
  check("…and nothing else under row two", !(await client.ev("!!document.querySelector('[data-months-chart]')")) && !/Delivery by Campaign|Leads by Call Result/i.test(await client.text()));
  const lastMonth = sql("select (current_date - 30)::text");
  await client.go(`/?af=${lastMonth}&ato=${sql("select current_date::text")}`, 4000);
  check("a wider range takes in the older lead", (await rows()).length === 3, JSON.stringify(await rows()));
  await client.go(`/?af=${lastMonth}&ato=${sql("select current_date::text")}&at=appointment`, 4000);
  check("…by type: appointments only", (await rows()).length === 1, JSON.stringify(await rows()));
  await client.go(`/?af=${lastMonth}&ato=${sql("select current_date::text")}&ap=${P2}`, 4000);
  check("…by project", (await rows()).length === 1 && /Contractors/.test((await rows())[0]), JSON.stringify(await rows()));

  section("A note to the manager who developed it");
  await client.go("/", 4000);
  await client.click(`[data-activity-row] [data-message-manager="${SEAN}"]`);
  await until(() => client.ev("!!document.querySelector('[data-message-body]')"));
  await client.fill("[data-message-body]", `${TAG} Can you confirm the owner's email before Thursday?`);
  await client.click("[data-send-message]");
  const note = await until(() => sql(`select coalesce((select title || ' | ' || link || ' | ' || coalesce(body, '') from public.notifications
    where user_id = ${SEAN} and sender_id = ${CLIENT} and kind = 'message' and body like ${lit(`${TAG}%`)} order by id desc limit 1), '')`) || null, { timeout: 10000 });
  check("their name opens a message to them, delivered to the manager as a message linked to the lead", Boolean(note) && note.includes(`/leads/${ids[2]}`) && /Message from/.test(note), note);

  section("The client opens one of their leads");
  await client.go("/", 4000);
  await client.click(`[data-activity-lead="${ids[2]}"]`);
  await until(async () => (await client.path()) === `/leads/${ids[2]}`);
  // The Notes tab, clicked again until the page has woken up and shows it.
  const sheet = await until(async () => {
    await client.ev(`[...document.querySelectorAll('[role=tab]')].find((x) => /^Notes/.test(x.textContent.trim()))?.click()`);
    const t = await client.text();
    return /owner prefers mornings/.test(t) ? t : null;
  }, { timeout: 12000 });
  check("it opens, with the client notes", Boolean(sheet));
  check("…never the internal notes", !(sheet ?? "").includes("INTERNAL call after 3pm"));
  check("…and back goes to their dashboard", Boolean(await client.ev(`!![...document.querySelectorAll('a[href="/"]')].find((a) => /Back to dashboard/.test(a.textContent))`)));
  const elsewhere = sql(`select coalesce((select l.id::text from public.leads l join public.projects p on p.id = l.project_id where p.company_id <> ${company} and l.deleted_at is null order by l.id limit 1), '')`);
  if (elsewhere) {
    await client.go(`/leads/${elsewhere}`, 4000);
    check("a name on someone else's project stays closed to them", /not found|could not be found|404/i.test(await client.text()) && !(await client.ev("!!document.querySelector('[data-tab-panel]')")));
  }

  section("An administrator, on the client's page");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 950 });
  const href = sql(`select '/clients/' || ${lit(slug)}`);
  await admin.go(href, 4000);
  if (!(await admin.ev("!!document.querySelector('[data-client-own-tiles]')"))) {
    // The slug the app gives the name, from its own link on the clients list.
    await admin.go("/clients", 3000);
    const link = await admin.ev(`[...document.querySelectorAll('a[href^="/clients/"]')].find((a) => a.textContent.includes(${JSON.stringify(`${TAG} Insurance`)}))?.getAttribute('href')`);
    await admin.go(link, 4000);
  }
  const own = await until(() => admin.ev(`document.querySelector('[data-client-own-tiles]')?.innerText.replace(/\\s+/g, ' ')`));
  check("the same Appointment Results and Upcoming Pipeline, for that client", /Appointment Results/i.test(own ?? "") && /Quoting 1/.test(own ?? "") && /Upcoming Pipeline/i.test(own ?? "")
    && own.includes(`${label(1)} 2`), own);
  check("…and the same Sale Pipeline, goal and all", Boolean(await admin.ev("!!document.querySelector('[data-sale-pipeline]')"))
    && /\$120,000/.test((await admin.ev(`document.querySelector('[data-sale-stat="goal"]')?.innerText`)) ?? ""), await admin.ev(`document.querySelector('[data-sale-stat="goal"]')?.innerText`));
} finally {
  browser.close();
  const like = lit(`${TAG}%`);
  sql(`update public.users set company_id = ${clientCompany} where id = ${CLIENT}`);
  sql(`delete from public.client_goals where company_id = ${company}`);
  sql(`delete from public.pay_events where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.notifications where body like ${lit(`${TAG}%`)}`);
  sql(`delete from public.lead_notes where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.appointments where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.insurance_details where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.leads where company_name like ${like}`);
  sql(`update public.projects set appt_project_id = null where id = ${DBDV}`);
  sql(`delete from public.projects where id in (${P1}, ${P2}, ${DBDV})`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("client dashboard");
