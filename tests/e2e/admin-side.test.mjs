/**
 * The administrator's side in a real browser, as in the client's Capital
 * Insurance walkthrough: open the project, read its true totals and who
 * works it, page through every one of its leads, look at its X-dates by
 * month and open the names behind a number; then, on a test project, put a
 * rep on and take them off, set pay rates, and read the production report
 * (and its CSV) as an administrator, an account manager and an agent. Last,
 * the appointment form's lead picker finds a lead beyond the old 300-name cap.
 *
 *   npm run test:e2e      (SHOTS=<dir> to keep screenshots)
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const SHOTS = process.env.SHOTS;
const TAG = `ADM-E2E ${Date.now()}`;
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const SEAN = userId("sean@beacon.test");
const RACHEL = userId("rachel@beacon.test");
const startNote = Number(sql("select coalesce(max(id), 0) from public.notifications"));
const started = sql("select now()");

// The walkthrough's project, read-only.
const CAPITAL = Number(sql("select id from public.projects where name like 'CapitalIns%BretGodsey%' limit 1"));
const count = (where) => Number(sql(`select count(*) from public.leads l join public.call_results r on r.id=l.result_id where l.project_id=${CAPITAL} ${where}`));

// A test project to change.
const typeId = (code) => sql(`select id from public.project_types where code=${lit(code)}`);
const companyId = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const MIKE = userId("mike@beacon.test");
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appointments`)}, ${companyId}, ${typeId("APPT")}, 1) returning id`));
const PROJECT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id) values (${lit(`${TAG} DBDev`)}, ${companyId}, ${typeId("DBDV")}, 1, ${APPT}) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${PROJECT}, ${SEAN}), (${APPT}, ${MIKE})`);
for (let i = 1; i <= 8; i++) sql(`insert into public.leads (company_name, project_id, assigned_user_id) values (${lit(`${TAG} Co ${i}`)}, ${PROJECT}, ${SEAN})`);
const held = (uid) => Number(sql(`select count(*) from public.leads where project_id=${PROJECT} and assigned_user_id=${uid}`));

// A lead well past the first 300 alphabetically, for the picker.
const far = JSON.parse(sql("select row_to_json(t) from (select id, company_name from public.leads where company_name is not null order by company_name, id offset 350 limit 1) t"));

const browser = await launchBrowser();
const shot = (page, name) => (SHOTS ? page.screenshot(`${SHOTS}/${name}.png`) : null);
const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage();
const cells = (page, selector) => page.ev(`[...document.querySelectorAll(${JSON.stringify(selector)} + ' td')].map((td) => td.innerText.trim())`);
const tile = (page, label) => page.ev(`(() => { const t = [...document.querySelectorAll('[data-panel]')].find((p) => p.querySelector('.stat-label')?.textContent.trim().toLowerCase() === ${JSON.stringify(label.toLowerCase())});
  return t?.querySelector('.stat-value')?.textContent.trim() ?? null; })()`);
const num = (s) => Number(String(s ?? "").replace(/[^\d.-]/g, ""));

try {
  section("The Capital Insurance project");
  await admin.go(`/projects/${CAPITAL}`, 5000);
  const total = count("");
  const left = count("and r.viable and r.callable");
  // Waited for: the page may still be loading, and the figures count up.
  const settles = (label, want) => until(async () => num(await tile(admin, label)) === want, { timeout: 8000 });
  check("Leads tile: every lead on the project, not the newest 25", (await settles("Leads", total)) && total > 25, `${await tile(admin, "Leads")} vs ${total}`);
  check("Names Left to Call tile matches the database", await settles("Names Left to Call", left), `${await tile(admin, "Names Left to Call")} vs ${left}`);
  const sean = await cells(admin, `tr[data-rep="${SEAN}"]`);
  const seanLeft = count(`and r.viable and r.callable and l.assigned_user_id=${SEAN}`);
  check("Sean is on it, with his names left and leads held", sean[0]?.startsWith("Sean Fitzgerald") && num(sean[1]) === seanLeft && num(sean[2]) === count(`and l.assigned_user_id=${SEAN}`), JSON.stringify(sean));
  const t = await admin.text();
  check("the table counts every lead", t.includes(`1–10 of ${total}`), t.match(/\d+–\d+ of \d+/)?.[0]);
  check("…and pages past the old cap", /Page 1 of \d+/.test(t) && Math.ceil(total / 10) > 3);
  await admin.go(`/projects/${CAPITAL}?page=4`, 4000);
  check("page 4 holds leads 31–40", (await admin.text()).includes(`31–40 of ${total}`));
  await admin.go(`/projects/${CAPITAL}?status=notint`, 4000);
  const notInt = count("and l.status_id = (select id from public.lead_statuses where code='notint')");
  check("a status chip narrows it in the database", (await admin.text()).includes(`of ${notInt}`) || notInt === 0, `${notInt} expected`);
  await shot(admin, "admin-project");

  section("X-dates by month, and the names behind a number");
  await admin.go(`/projects/${CAPITAL}`, 4000);
  await admin.click("a", "Full report");
  check("Full report opens the X-dates for this project", await until(async () => (await admin.url()) === `/reports/x-dates?project=${CAPITAL}`), await admin.url());
  await sleep(1500);
  const month = Number(sql(`select extract(month from public.lead_renewal_date(l.id))::int from public.leads l where l.project_id=${CAPITAL}
    group by 1 order by count(*) desc limit 1`));
  const viable = count(`and r.viable and extract(month from public.lead_renewal_date(l.id)) = ${month}`);
  const monthName = new Date(Date.UTC(2026, month - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const link = `a[href="/reports/x-dates?project=${CAPITAL}&month=${month}&bucket=viable#names"]`;
  const shown = await admin.ev(`[...document.querySelectorAll(${JSON.stringify(link)})].map((a) => a.textContent.trim()).filter(Boolean)[0] ?? ''`);
  check(`${monthName}: viable left matches the database`, num(shown) === viable && viable > 0, `${shown} vs ${viable}`);
  await admin.click(link);
  check("clicking it lists those names", await until(async () => (await admin.text()).includes(`1–10 of ${viable}`)), (await admin.text()).match(/\d+–\d+ of \d+/)?.[0]);
  check("…under a heading that says which", new RegExp(`Renewing in ${monthName}\\s*·\\s*Viable left`, "i").test(await admin.text()));
  const firstLead = await admin.ev(`document.querySelector('#names a[href^="/leads/"]')?.getAttribute('href')`);
  await admin.click(`#names a[href="${firstLead}"]`);
  check("a name opens its lead sheet", await until(async () => (await admin.path()) === firstLead), await admin.path());
  await shot(admin, "admin-xdates-lead");

  section("Putting a rep on a project and taking them off");
  await admin.go(`/projects/${PROJECT}`, 4000);
  check("Sean holds all 8 to start", held(SEAN) === 8);
  await admin.fill(`#add-rep-${PROJECT}`, String(RACHEL));
  await admin.click("button", "Add to project");
  check("adding Rachel says what moved", /4 names moved/.test((await admin.waitToast(/is on this project/)) ?? ""), await admin.toasts());
  check("…and splits the names 4 and 4", await until(() => held(SEAN) === 4 && held(RACHEL) === 4), `${held(SEAN)} / ${held(RACHEL)}`);
  check("…and she is in the table", await until(async () => (await cells(admin, `tr[data-rep="${RACHEL}"]`))[1] === "4"));
  await admin.click(`button[aria-label="Take Rachel Colestock off this project"]`);
  check("taking her off asks first, saying where her names go", /Their 4 names go to the others/.test(await admin.text()));
  await admin.click("button", "Remove");
  check("…then gives Sean all 8 back", await until(() => held(SEAN) === 8 && held(RACHEL) === 0), `${held(SEAN)} / ${held(RACHEL)}`);
  check("…and she is off the table", await until(async () => !(await admin.ev(`!!document.querySelector('tr[data-rep="${RACHEL}"]')`))));

  section("Pay rates and the production report");
  await admin.go("/reports/production#rates", 4000);
  await admin.click(`tr[data-project="${PROJECT}"] button`, "Set rates");
  // Each rate is picked from the range in Settings: lead $8–$12, appointment $30–$50, special pay $5–$20.
  await until(() => admin.ev("!!document.querySelector('select[name=lead_rate]')"));
  const leadChoices = await admin.ev("[...document.querySelectorAll('select[name=lead_rate] option')].map((o) => o.value).join(' ')");
  check("lead pay is picked from $0 or $8–$12 in 50¢ steps", leadChoices === "0.00 8.00 8.50 9.00 9.50 10.00 10.50 11.00 11.50 12.00", leadChoices);
  await admin.fill("select[name=lead_rate]", "12.00");
  await admin.fill("select[name=appointment_rate]", "30.00");
  await admin.fill("select[name=confirmation_rate]", "5.00");
  await admin.click("button", "Save rates");
  await admin.waitToast(/Pay rates saved/);
  check("the rates are saved", await until(() => sql(`select lead_rate || '/' || appointment_rate || '/' || confirmation_rate from public.projects where id=${PROJECT}`) === "12.00/30.00/5.00"),
    sql(`select lead_rate || '/' || appointment_rate || '/' || confirmation_rate from public.projects where id=${PROJECT}`));
  check("…and shown in the table", await until(async () => (await cells(admin, `tr[data-project="${PROJECT}"]`)).slice(2, 5).join(" ") === "$12.00 $30.00 $5.00"));

  // Sean works two names: one not interested, one appointment ($30).
  const seanApi = await signIn("sean@beacon.test");
  const result = (type, name) => Number(sql(`select id from public.call_results where project_type=${lit(type)} and name=${lit(name)}`));
  const [a, b] = sql(`select string_agg(id::text, ',' order by id) from (select id from public.leads where project_id=${PROJECT} order by id limit 2) t`).split(",").map(Number);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const r1 = await seanApi.sb.rpc("record_call_result", { p_lead_id: a, p_result_id: result("DBDV", "Not Interested"), p_notes: null, p_appointment: null, p_corrected_xdate: null });
  const r2 = await seanApi.sb.rpc("record_call_result", { p_lead_id: b, p_result_id: result("DBDV", "Appointment"), p_notes: null,
    p_appointment: { date: tomorrow, time: "10:00 AM", duration: 30, rep_name: "Bret Godsey" }, p_corrected_xdate: null, p_ultimate_xdate: "2027-03-01" });
  check("Sean makes two calls, one an appointment", !r1.error && !r2.error, r1.error?.message ?? r2.error?.message);

  await admin.go(`/reports/production?period=today&project=${PROJECT}`, 4000);
  const row = await cells(admin, `tr[data-rep="${SEAN}"]`);
  check("today, on that project: Sean, 2 calls, 1 appointment, $30.00", row[0] === "Sean Fitzgerald" && row[1] === "2" && row[3] === "1" && row[6] === "$30.00", JSON.stringify(row));
  check("the Pay tile agrees", await until(async () => (await tile(admin, "Pay")) === "$30.00"), await tile(admin, "Pay"));
  const callBars = await admin.ev(`[...document.querySelectorAll('[data-panel]')].find((p) => /^calls$/i.test(p.querySelector('.stat-label')?.textContent.trim()))?.querySelectorAll(':scope > svg rect').length ?? 0`);
  check("even for one day, the tiles plot the last 14", callBars === 14, `${callBars} bars`);
  const csv = await admin.ev(`fetch('/api/reports/production?period=today&project=${PROJECT}').then((r) => r.text())`);
  // Day, account manager, client, project, five counts, then lead, appointment and special pay, chargebacks and the total.
  check("the CSV export has the same row", /Sean Fitzgerald,"?[^\n]*DBDev"?,2,0,1,0,0,0\.00,30\.00,0\.00,0\.00,30\.00/.test(csv), csv.split("\n").slice(0, 2).join(" | "));
  await shot(admin, "admin-production");

  const manager = await (await browser.newContext({ as: "mike@beacon.test" })).newPage();
  await manager.go(`/reports/production?period=today&project=${PROJECT}&rep=${SEAN}`, 4000);
  const mt = await manager.text();
  check("an account manager sees only their own production", !(await manager.ev(`!!document.querySelector('tr[data-rep="${SEAN}"]')`)) && /My pay/i.test(mt), mt.slice(0, 120));
  check("…and no rates to set", !/Pay rates by project/i.test(mt));
  const empty = await manager.ev(`[...document.querySelectorAll('[data-panel]')].filter((p) => p.querySelector(':scope > div > .stat-value'))
    .map((p) => p.querySelector(':scope > svg')?.dataset.sparkline ?? 'none')`);
  check("with nothing to plot, every tile shows the same baseline", empty.length === 6 && empty.every((s) => s === "empty"), JSON.stringify(empty));
  const agent = await (await browser.newContext({ as: "agent@beacon.test" })).newPage();
  const agentCsv = await (async () => { await agent.go("/reports/production", 3500); return agent.ev(`fetch('/api/reports/production?period=today&rep=${SEAN}').then((r) => r.text())`); })();
  check("an agent's CSV holds only their own rows", !agentCsv.includes("Sean Fitzgerald"), agentCsv.slice(0, 120));
  // Six tiles in one row at 1600px, where some notes wrap to two lines: every
  // chart still sits on its tile's foot, so the baselines line up.
  const wide = await (await browser.newContext({ as: "agent@beacon.test" })).newPage({ width: 1600, height: 900 });
  await wide.go("/reports/production", 4000);
  const feet = await wide.ev(`[...document.querySelectorAll('[data-panel]')].filter((p) => p.querySelector(':scope > div > .stat-value')).map((p) => {
    const tile = p.getBoundingClientRect(); const chart = p.querySelector(':scope > svg').getBoundingClientRect();
    return { top: Math.round(tile.top), gap: Math.round(tile.bottom - chart.bottom), noteLines: Math.round(p.querySelector('.stat-value + div').getBoundingClientRect().height / 16) };
  })`);
  check("six tiles in one row, some notes on two lines", feet.length === 6 && new Set(feet.map((f) => f.top)).size === 1 && feet.some((f) => f.noteLines > 1), JSON.stringify(feet));
  check("…and every chart sits on its tile's foot, in line with the others", feet.every((f) => f.gap === feet[0].gap && f.gap <= 2), JSON.stringify(feet.map((f) => f.gap)));
  await shot(wide, "admin-production-wide");

  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage();
  check("a client cannot export production", (await (async () => { await client.go("/", 3000); return client.ev("fetch('/api/reports/production').then((r) => r.status)"); })()) === 403);

  section("The lead picker searches every lead");
  await admin.go("/appointments", 4000);
  await admin.click("button", "New appointment");
  await until(() => admin.ev("!!document.querySelector('[role=combobox]')"));
  await admin.fill("[role=combobox]", far.company_name);
  check(`typing finds "${far.company_name}", past the first 300 names`, await until(() => admin.ev(`[...document.querySelectorAll('[role=option]')].some((o) => o.textContent.includes(${JSON.stringify(far.company_name)}))`), { timeout: 5000 }));
  await admin.ev(`[...document.querySelectorAll('[role=option]')].find((o) => o.textContent.includes(${JSON.stringify(far.company_name)})).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
  check("picking it fills the lead", (await admin.ev("document.querySelector('input[name=lead_id]').value")) === String(far.id));
  await admin.fill("input[name=appt_date]", tomorrow);
  await admin.click("button", "Schedule");
  await admin.waitToast(/Appointment scheduled/);
  check("the appointment is booked on that lead", await until(() => Number(sql(`select count(*) from public.appointments where lead_id=${far.id} and appt_date=${lit(tomorrow)} and appt_create_date >= ${lit(started)}`)) === 1));

  section("Phone width");
  const phone = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 390, height: 844 });
  for (const path of [`/projects/${CAPITAL}`, "/reports/x-dates", "/reports/production"]) {
    await phone.go(path, 4500);
    const overflow = await phone.ev("document.documentElement.scrollWidth - document.documentElement.clientWidth");
    check(`no sideways scrolling on ${path}`, overflow <= 0, `overflow ${overflow}px`);
  }
  await shot(phone, "admin-production-phone");
} finally {
  sql(`delete from public.appointments where lead_id=${far.id} and appt_create_date >= ${lit(started)}`);
  sql(`delete from public.notifications where id > ${startNote} and (title like ${lit(`%${TAG}%`)} or body like ${lit(`%${TAG}%`)} or title like ${lit(`%${far.company_name}%`)} or kind = 'lead')`);
  sql(`delete from public.pay_events where lead_id in (select id from public.leads where company_name like ${lit(`${TAG}%`)})`);
  sql(`update public.call_records set appointment_id = null where lead_id in (select id from public.leads where company_name like ${lit(`${TAG}%`)})`);
  sql(`delete from public.appointments where lead_id in (select id from public.leads where company_name like ${lit(`${TAG}%`)})`);
  sql(`delete from public.leads where company_name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.project_assignments where project_id in (select id from public.projects where name like ${lit(`${TAG}%`)})`);
  sql(`update public.projects set appt_project_id = null where name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.projects where name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.companies where name like ${lit(`${TAG}%`)}`);
  browser.close();
}

finish("admin side (browser)");
