/**
 * Back to where a lead was opened from, and the Leads list's filters (Sean,
 * Oct 2026): a lead opened from the Lead Explorer, the Leads list or the
 * Appointments list goes back there with its filters as they were; the Leads
 * list filters by client, project, manager, call result and the days a lead
 * was last called or changed, as the Appointments list does.
 *
 * Removes everything it made.
 *
 *   node tests/run.mjs tests/e2e/leads-filters.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `LF${Date.now()}`;
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const [SEAN, MIKE] = [userId("sean@beacon.test"), userId("mike@beacon.test")];
const typeId = (code) => sql(`select id from public.project_types where code=${lit(code)}`);
const company = (name) => Number(sql(`insert into public.companies (name) values (${lit(`${TAG} ${name}`)}) returning id`));
const [ONE, TWO] = [company("One Insurance"), company("Two Insurance")];
const project = (name, co) => Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} ${name}`)}, ${co}, ${typeId("APPT")}, 1) returning id`));
const [P1, P2, P3] = [project("One Appts", ONE), project("One More Appts", ONE), project("Two Appts", TWO)];
const lead = (name, proj, rep) => Number(sql(`insert into public.leads (company_name, project_id, assigned_user_id) values (${lit(`${TAG} ${name}`)}, ${proj}, ${rep}) returning id`));
const A = lead("Alpha Roofing", P1, SEAN);
const B = lead("Bravo Glass", P2, MIKE);
const C = lead("Charlie Plumbing", P3, SEAN);
// Each on a call result of its own, for the call result filter's several at once.
const resultOf = (name) => Number(sql(`select id from public.call_results where project_type = 'APPT' and name = ${lit(name)}`));
const [EMAIL, BRANCH, INVALID] = [resultOf("Lead-Email"), resultOf("Lead-Branch"), resultOf("Lead-Invalid")];
sql(`update public.leads set result_id = ${EMAIL} where id = ${A}`);
sql(`update public.leads set result_id = ${BRANCH} where id = ${B}`);
sql(`update public.leads set result_id = ${INVALID} where id = ${C}`);
// Called back in March: the one the days filter finds (each was changed just now, when made).
sql(`update public.leads set date_last_worked = '2026-03-10 18:00:00+00' where id = ${A}`);
sql(`insert into public.appointments (lead_id, user_id, project_id, appt_date, appt_time, status_id, qa_status)
  values (${C}, ${SEAN}, ${P3}, ((now() at time zone public.business_tz())::date + 1), '10:00 AM', (select id from public.appointment_statuses where name='Scheduled'), 'passed')`);

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 1100 });
  const shown = () => admin.ev(`[...document.querySelectorAll('[data-lead-link]')].map((a) => a.textContent).filter((t) => t.includes(${JSON.stringify(TAG)}))`);
  const has = (list, name) => list.includes(`${TAG} ${name}`);
  const back = () => admin.ev(`(() => { const a = [...document.querySelectorAll('a')].find((e) => /^Back to/i.test(e.textContent.trim())); return a ? { text: a.textContent.trim(), href: a.getAttribute('href') } : null; })()`);

  section("Back to the Lead Explorer, its filters kept");
  const explore = `/explore?q=${encodeURIComponent(TAG)}&clients=${ONE}`;
  await admin.go(explore, 6000);
  await admin.click(`a[href^="/leads/${A}?from="]`);
  await until(async () => (await admin.path()) === `/leads/${A}`);
  const b1 = await until(back);
  check("the lead says Back to Lead Explorer", b1?.text === "Back to Lead Explorer", JSON.stringify(b1));
  await admin.click(`a[href="${b1?.href}"]`);
  check("…and goes back with the filters as they were", Boolean(await until(async () => (await admin.url()) === explore)), await admin.url());

  section("The Leads list's filters");
  const list = async (query, expect) => { await admin.go(`/leads?q=${encodeURIComponent(TAG)}${query}`, 5000); return (await until(async () => { const r = await shown(); return expect(r) ? r : null; }, { timeout: 6000 })) ?? shown(); };
  const all = await list("", (r) => r.length === 3);
  const filterText = await admin.ev(`document.querySelector('[data-lead-filters]').innerText`);
  check("filters for client, project, manager and when last worked, beside call result", all.length === 3
    && ["Last worked", "Client", "Project", "Manager"].every((l) => new RegExp(l, "i").test(filterText)), filterText);
  const byClient = await list(`&client=${ONE}`, (r) => r.length === 2);
  check("by client: its projects' leads", has(byClient, "Alpha Roofing") && has(byClient, "Bravo Glass") && !has(byClient, "Charlie Plumbing"), JSON.stringify(byClient));
  const byProject = await list(`&client=${ONE}&project=${P2}`, (r) => r.length === 1);
  check("by project", JSON.stringify(byProject) === JSON.stringify([`${TAG} Bravo Glass`]), JSON.stringify(byProject));
  const byManager = await list(`&rep=${SEAN}`, (r) => r.length === 2);
  check("by manager", has(byManager, "Alpha Roofing") && has(byManager, "Charlie Plumbing") && !has(byManager, "Bravo Glass"), JSON.stringify(byManager));
  // Call results, several at once (Sean, Oct 2026), in his sheet's order, ticked in a drop-down.
  await list("", (r) => r.length === 3);
  await admin.click('[data-multi-facet="result"] button');
  const order = await until(() => admin.ev(`[...document.querySelectorAll('[data-multi-facet-list="result"] [role=option]')].map((o) => o.textContent.trim())`).then((o) => (o?.length ? o : null)));
  check("the call results in the sheet's order: appointments first, then Lead-No Contact on, then DB dev",
    order?.[0] === "Appointment (Appt)" && order?.indexOf("Lead-No Contact (Appt)") === 4 && order?.indexOf("Lead-Disco# (Appt)") < order?.findIndex((o) => /\(DB dev\)$/.test(o)), JSON.stringify(order?.slice(0, 6)));
  await admin.click(`[data-multi-facet-list="result"] [data-option="${EMAIL}"]`);
  await until(async () => (await admin.url()).includes(`result=${EMAIL}`));
  await admin.click(`[data-multi-facet-list="result"] [data-option="${BRANCH}"]`);
  const two = await until(async () => { const r = await shown(); return (await admin.url()).includes("result=") && r.length === 2 ? r : null; }, { timeout: 8000 });
  check("two picked: leads on either", has(two ?? [], "Alpha Roofing") && has(two ?? [], "Bravo Glass") && !has(two ?? [], "Charlie Plumbing"), `${await admin.url()} ${JSON.stringify(two ?? await shown())}`);
  check("…the list saying how many", /2 selected/.test((await admin.ev(`document.querySelector('[data-multi-facet="result"] button').innerText`)) ?? ""));
  const three = await list(`&result=${EMAIL},${BRANCH},${INVALID}`, (r) => r.length === 3);
  check("…and from the address, all three", three.length === 3, JSON.stringify(three));
  const byDays = await list(`&from=2026-03-01&to=2026-03-31`, (r) => r.length === 1);
  check("by the days last called or changed", JSON.stringify(byDays) === JSON.stringify([`${TAG} Alpha Roofing`]), JSON.stringify(byDays));
  // Called in March, but changed since (when the test set that): the later of the two shows.
  check("…each with when it was last called or changed, the later", /^\d{2}\/\d{2}\/\d{4}$/.test((await admin.ev(`document.querySelector('[data-last-worked]')?.textContent`)) ?? ""));

  section("Back to the Leads list, and to Appointments");
  const filteredList = `/leads?q=${encodeURIComponent(TAG)}&rep=${SEAN}`;
  await admin.go(filteredList, 5000);
  await admin.click(`a[data-lead-link][href^="/leads/${A}?from="]`);
  await until(async () => (await admin.path()) === `/leads/${A}`);
  const b2 = await until(back);
  check("a lead opened from Leads goes back to them, filtered as they were", b2?.text === "Back to leads" && b2.href === filteredList, JSON.stringify(b2));
  await admin.go(`/appointments?client=${TWO}`, 5000);
  await admin.click(`[data-appt-row]`);
  await until(async () => (await admin.path()) === `/leads/${C}`);
  const b3 = await until(back);
  check("…and from Appointments, back to them", b3?.text === "Back to appointments" && b3.href === `/appointments?client=${TWO}`, JSON.stringify(b3));
  await admin.go(`/leads/${A}?from=${encodeURIComponent("https://evil.test/explore")}`, 4000);
  check("a back link to anywhere else is not taken", (await until(back))?.href === "/leads");
} finally {
  browser.close();
  sql(`delete from public.appointments where lead_id = ${C}`);
  sql(`delete from public.leads where company_name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.projects where name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.companies where id in (${ONE}, ${TWO})`);
}
finish("leads filters");
