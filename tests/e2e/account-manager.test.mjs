/**
 * The account manager's day, in a real browser: My Projects → a call list in
 * weighted order → the lead sheet → a result button → the next name. Then the
 * appointment follow-up, QA, and the appointment manager picking up the lead
 * that was promoted to them.
 *
 * Runs on its own test client and removes everything it made.
 *
 *   npm run test:e2e      (SHOTS=<dir> to keep screenshots)
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `AM-TEST ${Date.now()}`;
const SHOTS = process.env.SHOTS;
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const SEAN = userId("sean@beacon.test");
const MIKE = userId("mike@beacon.test");
const typeId = (code) => sql(`select id from public.project_types where code=${lit(code)}`);
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, state) values (${lit(`${TAG} Appointments`)}, ${company}, ${typeId("APPT")}, 1, 'OH') returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, state, timezone_id, appt_project_id)
  values (${lit(`${TAG} DBDev`)}, ${company}, ${typeId("DBDV")}, 1, 'OH', (select id from public.timezones where name='EST'), ${APPT}) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${DBDV}, ${SEAN}), (${APPT}, ${MIKE})`);
const names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"].map((w, i) => Number(sql(
  `insert into public.leads (company_name, contact_name, phone, city, state, project_id, assigned_user_id)
   values (${lit(`${TAG} ${w} Plumbing`)}, 'Pat ${w}', '614-555-01${i}0', 'Columbus', 'OH', ${DBDV}, ${SEAN}) returning id`)));
const lead = (id) => JSON.parse(sql(`select row_to_json(t) from (select l.project_id, l.stage, l.assigned_user_id as rep, r.name as result, l.call_weight as weight
  from public.leads l join public.call_results r on r.id=l.result_id where l.id=${id}) t`));

const browser = await launchBrowser();
const shot = (page, name) => (SHOTS ? page.screenshot(`${SHOTS}/${name}.png`) : null);
/** Click the result button with exactly this title. */
const pick = (page, name) => page.ev(`(() => { const b = [...document.querySelectorAll('button[aria-pressed]')].find((x) => x.textContent.trim() === ${JSON.stringify(name)}); if (!b) return false; b.click(); return true; })()`);
const buttons = (page) => page.ev(`[...document.querySelectorAll('button[aria-pressed]')].map((b) => b.textContent.trim())`);
const save = async (page) => {
  const before = await page.url();
  await page.click("button", "Save:");
  await until(async () => (await page.url()) !== before, { timeout: 10000 });
  await sleep(1200);
};

try {
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage();

  section("My Projects");
  await sean.go("/work");
  let t = await sean.text();
  check("My Projects is in Sean's sidebar", /My Projects/.test(t));
  check("the test project is listed with his 5 names", t.includes(`${TAG} DBDev`) && new RegExp(`${TAG} DBDev[\\s\\S]{0,200}\\b5\\b`).test(t));
  // A filter appears once its column has something to choose between (here: state and time zone).
  check("filters for state and time zone", ["STATE", "TIME ZONE"].every((f) => t.toUpperCase().includes(f)));
  check("a project he is not on is not listed", !t.includes(`${TAG} Appointments`));
  await shot(sean, "am-my-projects");

  section("The call list");
  await sean.go(`/work/${DBDV}`);
  t = await sean.text();
  check("5 names left for him", /\b5\b\s*names left for you/i.test(t));
  const order = await sean.ev(`[...document.querySelectorAll('tbody tr')].map((r) => r.innerText.split('\\t')[1] ?? r.innerText)`);
  check("in the order they arrived (all uncalled)", ["Alpha", "Bravo", "Charlie", "Delta", "Echo"].every((w, i) => String(order[i]).includes(w)), JSON.stringify(order));
  const seanHead = await sean.ev(`document.querySelector('thead')?.innerText ?? ''`);
  check("no call counts for an account manager", /\bcompany\b/i.test(seanHead) && !/\bcalls\b/i.test(seanHead), seanHead);
  check("Start calling opens the first name", await sean.click("a", "Start calling"));
  await until(async () => (await sean.path()) === `/leads/${names[0]}`);
  check("…on its lead sheet, in call-list mode", (await sean.url()) === `/leads/${names[0]}?project=${DBDV}`, await sean.url());
  await sleep(1500);

  section("The lead sheet");
  t = await sean.text();
  check("four boxes: business, contact, coverage, where it stands", ["BUSINESS", "CONTACT", "COVERAGE", "WHERE IT STANDS"].every((b) => t.toUpperCase().includes(b)));
  check("history underneath", /CALL HISTORY/i.test(t) && /APPOINTMENTS/i.test(t));
  const dbdvButtons = await buttons(sean);
  check("DBDev result buttons on the right", ["Viable-CallBack", "Viable-Left Message", "Lead", "Lead-Hot Lead", "Appointment-Phone", "Not Interested", "Pending"].every((b) => dbdvButtons.includes(b)), dbdvButtons.join(", "));
  check("Viable-No Contact is now Viable-CallBack", !dbdvButtons.includes("Viable-No Contact"));
  check("no appointment-project buttons on a DBDev name", !dbdvButtons.includes("Lead-No Contact") && !dbdvButtons.includes("Lead-Not Shopping"));
  check("the list position and Change project are shown", /5\s*left/.test(t) && /Change project/i.test(t));
  await shot(sean, "am-lead-sheet");

  section("Working the list");
  await pick(sean, "Viable-Left Message");
  check("choosing a result shows no description over the notes", !/Stays on active DBDev call lists/.test(await sean.text()));
  // The description shows in the app's own tooltip on a short hover, never as a browser title tooltip.
  const lmButton = await sean.ev(`(() => { const b = [...document.querySelectorAll('button[aria-pressed]')].find((x) => x.textContent.trim() === 'Viable-Left Message');
    const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, title: b.title }; })()`);
  await sean.hover({ x: lmButton.x, y: lmButton.y });
  const described = await until(() => sean.ev(`document.querySelector('[role=tooltip][data-tip-open]')?.textContent ?? ''`).then((t) => /Stays on active DBDev call lists/.test(t) && t));
  check("…which shows over the button on hover instead, in the app's style", Boolean(described) && lmButton.title === "", lmButton.title || "no tooltip");
  await sean.hover({ x: 5, y: 5 });
  // The notes open with the date (the business's) and who is writing: "10/2/26 seanf: ".
  const [y, m, d] = sql("select (now() at time zone public.business_tz())::date").split("-");
  const stamp = `${Number(m)}/${Number(d)}/${y.slice(2)} seanf:`;
  const opened = await until(() => sean.ev(`document.querySelector('textarea[name="notes"]')?.value ?? ''`).then((v) => v.startsWith(stamp) && v));
  check("entering the notes starts them with the date and username", Boolean(opened), `${await sean.ev(`document.querySelector('textarea[name="notes"]')?.value`)} vs ${stamp}`);
  await sean.fill('textarea[name="notes"]', `${stamp} Left a message with the office manager`);
  await save(sean);
  check("…and the note is saved with it", sql(`select notes from public.call_records where lead_id=${names[0]} order by id desc limit 1`) === `${stamp} Left a message with the office manager`);
  check("saving moves on to the next name", (await sean.url()) === `/leads/${names[1]}?project=${DBDV}`, await sean.url());
  check("the first name stays on the list, called once", lead(names[0]).result === "Viable-Left Message" && lead(names[0]).weight === 1);

  await pick(sean, "Lead");
  check("a Lead asks for the Ultimate X-Date", await until(() => sean.ev(`!!document.querySelector('input[name="ultimate_xdate"]')`)));
  await sean.click("button", "Save:");
  check("saving without it says what is missing", Boolean(await until(() => sean.ev(`[...document.querySelectorAll('[role=alert]')].some((e) => /Missing the Ultimate X-Date/.test(e.textContent))`))));
  check("…and records nothing", lead(names[1]).weight === 0 && lead(names[1]).stage === "dbdev");
  // Typed into the date box, as a person would; leaving it sets the date.
  await sean.fill('input[aria-label="Ultimate X-Date"]', "3/1/27");
  await sean.ev("document.activeElement?.blur()");
  await save(sean);
  check("…with it, the X-date is on the record", sql(`select ultimate_xdate from public.insurance_details where lead_id=${names[1]}`) === "2027-03-01");
  const promoted = lead(names[1]);
  check("Lead: promoted to the appointment project, handed to Mike", promoted.project_id === APPT && promoted.stage === "appt" && promoted.rep === MIKE && promoted.result === "Lead-No Contact", JSON.stringify(promoted));
  check("…and Sean moved on to the third name", (await sean.url()) === `/leads/${names[2]}?project=${DBDV}`);

  await pick(sean, "Appointment-Phone");
  check("an appointment result asks for the X-date, date and time", await sean.ev(`!!document.querySelector('input[name="ultimate_xdate"]') && !!document.querySelector('input[name="appt_date"]') && !!document.querySelector('select[name="appt_time"]')`));
  await sean.click("button", "Save:");
  const missing = await until(() => sean.ev(`[...document.querySelectorAll('[role=alert]')].map((e) => e.textContent).find((t) => /^Missing/.test(t)) ?? ''`));
  check("saving with nothing filled in names everything missing at once", /Ultimate X-Date/.test(missing) && /appointment date/.test(missing) && /appointment time/.test(missing), missing);
  check("…and records nothing", lead(names[2]).weight === 0);
  await sean.fill('input[aria-label="Ultimate X-Date"]', "4/1/27");
  await sean.ev("document.activeElement?.blur()");
  await sean.fill('input[name="appt_date"]', tomorrow);
  await sean.fill('select[name="appt_time"]', "2:30 PM");
  await sean.fill('input[name="rep_name"]', "Bret Godsey");
  await save(sean);
  const appt = JSON.parse(sql(`select row_to_json(a) from (select qa_status, appt_time, rep_name, user_id from public.appointments where lead_id=${names[2]}) a`));
  check("the appointment is on the calendar, waiting for QA", appt?.qa_status === "pending" && appt.appt_time === "2:30 PM" && appt.rep_name === "Bret Godsey" && appt.user_id === SEAN, JSON.stringify(appt));
  check("Skip to next skips without recording", await sean.click("a", "Skip to next"));
  await until(async () => (await sean.path()) !== `/leads/${names[3]}`);
  check("…leaving the skipped name untouched", lead(names[3]).weight === 0);

  section("The follow-up");
  await sean.go("/work");
  t = await sean.text();
  check("My Projects lists the appointment to confirm", /Appointments to Confirm/i.test(t) && t.includes(`${TAG} Charlie Plumbing`));
  await sean.click("a", `${TAG} Charlie Plumbing`);
  await until(async () => (await sean.path()) === `/leads/${names[2]}`);
  await sleep(1500);
  const followUps = await buttons(sean);
  check("the lead sheet offers Confirmed and Invalid for his appointment", followUps.includes("Appointment-Confirmed") && followUps.includes("Appointment-Invalid"), followUps.join(", "));
  await pick(sean, "Appointment-Confirmed");
  await sean.click("button", "Save:");
  check("confirmed", await until(() => sql(`select confirmed_at is not null from public.appointments where lead_id=${names[2]}`) === "t", { timeout: 8000 }));

  section("QA");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage();
  await admin.go("/qa");
  check("the appointment waits in the QA queue", /Appointments Waiting for QA/i.test(await admin.text()) && (await admin.text()).includes(`${TAG} Charlie Plumbing`));
  await admin.ev(`[...document.querySelectorAll('li')].find((li) => li.innerText.includes(${JSON.stringify(`${TAG} Charlie Plumbing`)}))?.querySelector('button')?.click()`);
  check("an administrator passes it", await until(() => sql(`select qa_status from public.appointments where lead_id=${names[2]}`) === "passed", { timeout: 8000 }));
  await shot(admin, "am-qa");

  section("Administrators see the weighting");
  await admin.go(`/work/${DBDV}?rep=${SEAN}`);
  t = await admin.text();
  check("an administrator can open Sean's list, with call counts", /\bcalls\b/i.test(await admin.ev(`document.querySelector('thead')?.innerText ?? ''`)) && t.includes(`${TAG} Alpha Plumbing`));
  const alphaCalls = await admin.ev(`[...document.querySelectorAll('tbody tr')].find((r) => r.innerText.includes('Alpha Plumbing'))?.lastElementChild?.innerText`);
  check("…showing the one call made to Alpha", String(alphaCalls).trim() === "1", alphaCalls);

  section("The appointment manager");
  const mike = await (await browser.newContext({ as: "mike@beacon.test" })).newPage();
  await mike.go(`/work/${APPT}`);
  t = await mike.text();
  check("Mike's list has the promoted lead", t.includes(`${TAG} Bravo Plumbing`) && /\b1\b\s*names left for you/i.test(t));
  await mike.click("a", "Start calling");
  await until(async () => (await mike.path()) === `/leads/${names[1]}`);
  await until(() => mike.ev("document.querySelectorAll('button[aria-pressed]').length > 0"), { timeout: 10000 });
  const apptButtons = await buttons(mike);
  check("appointment-project buttons on his sheet", ["Lead-No Contact", "Lead-Not Shopping", "Lead-Corrected", "Lead-Invalid"].every((b) => apptButtons.includes(b)) && !apptButtons.includes("Viable-Staged"), apptButtons.join(", "));
  check("the sheet shows who developed it", /Developed by\s*Sean Fitzgerald/i.test(await mike.text()));
  const dial = await mike.ev(`[...document.querySelectorAll('a[href^="tel:"]')].filter((a) => /Call now/i.test(a.textContent)).map((a) => a.getAttribute('href'))`);
  check("Call now dials the lead's number", dial.length === 1 && dial[0] === "tel:+16145550110", JSON.stringify(dial));

  // At 1280px the panel is at its narrowest. Whatever the result, Save and
  // Cancel stay whole inside it (a long name once pushed Cancel off the edge).
  await mike.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  const clipped = [];
  for (const name of apptButtons) {
    await pick(mike, name);
    await sleep(80);
    const out = await mike.ev(`(() => { const form = document.querySelector('input[name=result_id]').form; const f = form.getBoundingClientRect();
      return [...form.querySelectorAll('button:not([aria-pressed])')].filter((b) => { const r = b.getBoundingClientRect(); return r.left < f.left - 0.5 || r.right > f.right + 0.5; })
        .map((b) => b.textContent.trim()); })()`);
    if (out.length) clipped.push(`${name}: ${out.join(" / ")}`);
  }
  check("Save and Cancel fit the panel for every result", apptButtons.length > 0 && clipped.length === 0, clipped.join("; ") || `${apptButtons.length} results tried`);
  await shot(mike, "am-save-row-1280");
  await mike.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
  await pick(mike, "Lead-Corrected");
  await mike.click("button", "Save:");
  check("Lead-Corrected asks for the corrected date", !!(await until(() => mike.ev(`[...document.querySelectorAll('[role=alert]')].some((e) => /corrected renewal date/i.test(e.textContent))`))));
  await mike.fill('input[name="corrected_xdate"]', "2027-08-01");
  await mike.click("button", "Save:");
  check("saved: the renewal is corrected", await until(() => sql(`select public.lead_renewal_date(${names[1]})`) === "2027-08-01", { timeout: 8000 }));
  await shot(mike, "am-appt-sheet");

  section("Who can open what");
  await sean.go(`/leads/${names[1]}`);
  check("an account manager can open any lead sheet (no more 'No access')", !/don.t have access/i.test(await sean.text()) && (await sean.text()).includes(`${TAG} Bravo Plumbing`));
  check("…but only the rep or the project's team gets result buttons", /Results on this name are recorded by/.test(await sean.text()));
  await sean.go("/leads");
  check("the full Leads list stays closed to account managers", /don.t have access/i.test(await sean.text()));
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage();
  await client.go("/work");
  check("clients have no call lists", /don.t have access/i.test(await client.text()));
  await client.go(`/leads/${names[0]}`);
  check("…and no lead sheets", /don.t have access/i.test(await client.text()));
} finally {
  browser.close();
  sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)} or body like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.pay_events where lead_id in (select id from public.leads where company_name like ${lit(`${TAG}%`)})`);
  sql(`update public.call_records set appointment_id = null where lead_id in (select id from public.leads where company_name like ${lit(`${TAG}%`)})`);
  sql(`delete from public.appointments where lead_id in (select id from public.leads where company_name like ${lit(`${TAG}%`)})`);
  sql(`delete from public.activity_log where entity='lead' and entity_id in (select id from public.leads where company_name like ${lit(`${TAG}%`)})`);
  sql(`delete from public.leads where company_name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.project_assignments where project_id in (${DBDV}, ${APPT})`);
  sql(`update public.projects set appt_project_id = null where id = ${DBDV}`);
  sql(`delete from public.projects where id in (${DBDV}, ${APPT})`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("account manager");
