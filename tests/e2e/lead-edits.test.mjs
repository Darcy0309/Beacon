/**
 * The lead page's edits, as the client asked (Sean, Oct 2026):
 *   Prospect Info: phone numbers go in as 602-555-0100 and nothing else; the
 *   state is picked from a list, the city and county suggested from that
 *   state's, a ZIP fills in the rest; each section in its own darker box;
 *   the fax kept.
 *   Coverage: dates read 01/01/2027; a line's date and carrier blank until
 *   filled; the main lines boxed apart from the rest, Prof. liability, D&O
 *   and E&O before Dental.
 *   Project Info: changed by administrators and the client, read by managers.
 *
 * Removes everything it made.
 *
 *   node tests/e2e/lead-edits.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `LE-E2E ${Date.now()}`;
const MIKE = Number(sql(`select id from public.users where email = 'mike@beacon.test'`));
const company = Number(sql("select company_id from public.users where email = 'client@beacon.test'"));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} Appts`)}, ${company}, (select id from public.project_types where code = 'APPT'), 1) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${APPT}, ${MIKE})`);
const lead = Number(sql(`insert into public.leads (company_name, phone, dm_mobile, project_id, stage, assigned_user_id, result_id)
  values (${lit(`${TAG} Alpine Mechanical`)}, '(623) 298-0611', '623 555 0142 cell', ${APPT}, 'appt', ${MIKE}, public.call_result_from_text('APPT', 'Lead-No Contact')) returning id`));
sql(`insert into public.insurance_details (lead_id, ultimate_xdate, pkg_xdate) values (${lead}, '2027-01-01', '2027-01-01')`);
const saved = (cols) => sql(`select concat_ws('|', ${cols}) from public.leads where id = ${lead}`);

const browser = await launchBrowser();
try {
  const mike = await (await browser.newContext({ as: "mike@beacon.test" })).newPage({ width: 1400, height: 1000 });
  const v = (sel) => mike.ev(`document.querySelector(${JSON.stringify(sel)})?.value ?? null`);
  const type = async (sel, text) => { await mike.fill(sel, text); await sleep(150); };

  section("Prospect Info: phone numbers");
  await mike.go(`/leads/${lead}`, 6000);
  await mike.click("[data-edit-prospect]");
  await until(() => mike.ev("!!document.querySelector('[data-prospect-form] [name=phone]')"));
  check("a number on file shows as 623-298-0611, a note after one dropped", (await v("[data-prospect-form] [name=phone]")) === "623-298-0611"
    && (await v("[data-prospect-form] [name=dm_mobile]")) === "623-555-0142", `${await v("[data-prospect-form] [name=phone]")} / ${await v("[data-prospect-form] [name=dm_mobile]")}`);
  await type("[data-prospect-form] [name=contact_mobile]", "(480) 555 0199 cell phone");
  check("typed with brackets, spaces and a word: 480-555-0199, the word not taken", (await v("[data-prospect-form] [name=contact_mobile]")) === "480-555-0199");
  await type("[data-prospect-form] [name=fax]", "6235550111");
  check("…ten digits grouped as they come", (await v("[data-prospect-form] [name=fax]")) === "623-555-0111");

  section("Prospect Info: the place");
  check("the state is picked from a list of the states", await mike.ev("(() => { const s = document.querySelector('[data-prospect-form] select[name=state]'); return Boolean(s) && s.options.length >= 51; })()"));
  await mike.fill("[data-prospect-form] select[name=state]", "AZ");
  await type("[data-prospect-form] [data-suggest=city] input", "Scotts");
  const cities = await until(() => mike.ev("[...document.querySelectorAll('[data-suggest=city] [role=option]')].map((o) => o.textContent)").then((o) => o.length && o));
  check("the city suggested from Arizona's as it is typed", Boolean(cities) && cities.includes("Scottsdale") && cities.every((c) => /^scotts/i.test(c)), JSON.stringify(cities));
  await type("[data-prospect-form] [data-suggest=county] input", "Mari");
  const counties = await until(() => mike.ev("[...document.querySelectorAll('[data-suggest=county] [role=option]')].map((o) => o.textContent)").then((o) => o.length && o));
  check("…and the county from its counties", JSON.stringify(counties) === JSON.stringify(["Maricopa"]), JSON.stringify(counties));
  await type("[data-prospect-form] [data-suggest=county] input", "Maripoca");
  await mike.ev("document.activeElement.blur()");
  check("a county not in the state's list is pointed out", Boolean(await until(() => mike.ev("/Not a county we know in AZ/.test(document.querySelector('[data-suggest=county]')?.textContent ?? '')"))));
  // Start the place over: only a ZIP.
  await mike.fill("[data-prospect-form] select[name=state]", "");
  await type("[data-prospect-form] [data-suggest=city] input", "");
  await type("[data-prospect-form] [data-suggest=county] input", "");
  await type("[data-prospect-form] input[name=zip]", "85027");
  await mike.ev("document.activeElement.blur()");
  const place = await until(async () => { const p = [await v("[data-prospect-form] [data-suggest=city] input"), await v("[data-prospect-form] select[name=state]"), await v("[data-prospect-form] [data-suggest=county] input")]; return p[0] && p; });
  check("a ZIP fills in the city, state and county", JSON.stringify(place) === JSON.stringify(["Phoenix", "AZ", "Maricopa"]), JSON.stringify(place));

  // Sean (Oct 2026): a ZIP in another state typed over an Arizona record changed nothing. A new ZIP is where the business is.
  await type("[data-prospect-form] input[name=zip]", "92101");
  const moved = await until(async () => { const p = [await v("[data-prospect-form] [data-suggest=city] input"), await v("[data-prospect-form] select[name=state]"), await v("[data-prospect-form] [data-suggest=county] input")]; return p[1] === "CA" && p; });
  check("a new ZIP, in another state, sets the city, state and county to its own", JSON.stringify(moved) === JSON.stringify(["San Diego", "CA", "San Diego"]), JSON.stringify(moved));
  check("…and says so", /From ZIP 92101: San Diego, CA · San Diego County/.test(await mike.ev("document.querySelector('[data-zip-said]')?.textContent ?? ''")));
  await type("[data-prospect-form] input[name=zip]", "00000");
  check("a ZIP that is none is said, and changes nothing", Boolean(await until(() => mike.ev("/00000 isn't a ZIP we know/.test(document.querySelector('[data-zip-said]')?.textContent ?? '')")))
    && (await v("[data-prospect-form] select[name=state]")) === "CA");
  await type("[data-prospect-form] input[name=zip]", "85027");
  await until(async () => (await v("[data-prospect-form] select[name=state]")) === "AZ");

  section("Prospect Info: each section boxed");
  const boxes = await mike.ev("[...document.querySelectorAll('[data-prospect-form] fieldset')].map((f) => [f.querySelector('legend')?.textContent, getComputedStyle(f).borderTopWidth])");
  check("Business, Location, Decision maker, Contact and Secondary contact, each in a box of a heavier line",
    JSON.stringify(boxes.map((b) => b[0])) === JSON.stringify(["Business", "Location", "Decision maker", "Contact", "Secondary contact"]) && boxes.every((b) => b[1] === "2px"), JSON.stringify(boxes));
  await mike.click("[data-prospect-form] button[type=submit]");
  check("saved: the numbers one way, the fax kept, the place filled in",
    Boolean(await until(() => saved("phone, fax, contact_mobile, dm_mobile, city, state, zip, county") === "623-298-0611|623-555-0111|480-555-0199|623-555-0142|Phoenix|AZ|85027|Maricopa")),
    saved("phone, fax, contact_mobile, dm_mobile, city, state, zip, county"));

  section("Coverage");
  await mike.go(`/leads/${lead}`, 5000);
  await mike.click('[role=tab][data-tab="coverage"]');
  await sleep(300);
  await mike.click("[data-edit-coverage]");
  await until(() => mike.ev("!!document.querySelector('[role=dialog] [data-coverage-group]')"));
  check("dates read 01/01/2027", (await v('[role=dialog] input[aria-label="Ultimate XDate"]')) === "01/01/2027" && (await v('[role=dialog] input[aria-label="Liability / Package X-Date"]')) === "01/01/2027");
  const blanks = await mike.ev(`[...document.querySelectorAll('[role=dialog] [data-coverage-line] input:not([type=hidden])')].map((i) => i.placeholder)`);
  check("a line's date and carrier say nothing until filled in; the Ultimate X-Date keeps its hint",
    blanks.length >= 20 && blanks.every((p) => !p) && /MM\/DD\/YYYY/.test(await mike.ev(`document.querySelector('[role=dialog] input[aria-label="Ultimate XDate"]').placeholder`)), JSON.stringify(blanks.slice(0, 4)));
  const groups = await mike.ev(`[...document.querySelectorAll('[role=dialog] [data-coverage-group]')].map((g) => [getComputedStyle(g).borderTopWidth, [...g.querySelectorAll('[data-coverage-line]')].map((l) => l.dataset.coverageLine).join(',')])`);
  check("the main lines in one heavier box; Prof. liability, D&O and E&O, then Dental and Vision in the next",
    JSON.stringify(groups) === JSON.stringify([["2px", "pkg,wc,auto,health,personal"], ["2px", "prof,do,eo,dental,vision"]]), JSON.stringify(groups));
  await mike.key("Escape");

  section("Project Info: administrators and the client change it");
  await mike.go(`/leads/${lead}?tab=info`, 5000);
  await until(() => mike.ev("!!document.querySelector('[data-tab-panel=info]')"));
  await sleep(500);
  check("a manager reads it, with no Edit", !(await mike.ev("!!document.querySelector('[data-tab-panel=info] [data-edit-project-info]')")));
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1400, height: 1000 });
  await client.go(`/leads/${lead}?tab=info`, 6000);
  check("the client changes it from their lead's page", Boolean(await until(() => client.ev("!!document.querySelector('[data-tab-panel=info] [data-edit-project-info]')"))));
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1400, height: 1000 });
  await admin.go(`/leads/${lead}?tab=info`, 6000);
  check("…and an administrator", Boolean(await until(() => admin.ev("!!document.querySelector('[data-tab-panel=info] [data-edit-project-info]')"))));
} finally {
  browser.close();
  sql(`delete from public.leads where id = ${lead}`);
  sql(`delete from public.projects where id = ${APPT}`);
}

finish("lead edits");
