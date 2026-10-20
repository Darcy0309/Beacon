/**
 * The lead page as Sean laid it out (Oct 2026), in a browser, as a manager:
 * Prospect Info (the business, its street address and county, its three
 * people) and its Edit; the Business tab's details and their Edit; Print
 * giving the client's lead sheet; Policy Files; sending the lead to another
 * manager; a call-back reminder to put on one's own calendar; the
 * appointment date picker showing the project's calendar; and the side menu
 * a manager has now.
 *
 *   node tests/run.mjs tests/e2e/lead-page.test.mjs
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { APP_URL } from "../support/env.mjs";
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { adminClient, cookieHeader, sessionCookies } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const SHOTS = process.env.SHOTS;
const TAG = `LPG${Date.now()}`;
const type = (code) => sql(`select id from public.project_types where code='${code}'`);
const resultId = (t, name) => Number(sql(`select id from public.call_results where project_type='${t}' and name=${lit(name)}`));
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const MIKE = Number(sql("select id from public.users where email='mike@beacon.test'"));
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts`)}, ${company}, ${type("APPT")}, 1) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${APPT}, ${SEAN})`);
const lead = Number(sql(`insert into public.leads (company_name, contact_name, contact_title, phone, city, state, zip, decision_maker, project_id, assigned_user_id, result_id, employees, sic_code)
  values (${lit(`${TAG} Medford Knife and Tool`)}, 'Dana Reyes', 'Office Manager', '480-555-0100', 'Mesa', 'AZ', '85213', 'Bob Medford', ${APPT}, ${SEAN}, ${resultId("APPT", "Lead-No Contact")}, '20', '7342-00') returning id`));
const tomorrow = sql("select ((now() at time zone public.business_tz())::date + 1)::text");
sql(`insert into public.calendar_blocks (project_id, starts_on, ends_on, start_time, end_time, note) values (${APPT}, ${lit(tomorrow)}, ${lit(tomorrow)}, '10:00', '13:00', 'Staff meeting')`);
const dir = mkdtempSync(path.join(tmpdir(), "lead-files-"));
const pdf = path.join(dir, "policy.pdf");
writeFileSync(pdf, "%PDF-1.4\n% a policy\n");
const cargoFile = path.join(dir, "cargo.csv");
writeFileSync(cargoFile, `Cargo\n${TAG} Lumber\n"${TAG} Steel, coiled"\n\n${TAG} lumber\n`);

const browser = await launchBrowser();
const cookie = cookieHeader(await sessionCookies("sean@beacon.test"));
try {
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1500, height: 1000 });
  const shot = (name) => (SHOTS ? sean.screenshot(`${SHOTS}/${name}.png`) : null);

  section("Prospect Info");
  await sean.go(`/leads/${lead}`, 5000);
  await sean.click("[data-edit-prospect]");
  await until(() => sean.ev(`!!document.querySelector('[data-prospect-form] input[name="address"]')`));
  const fields = await sean.ev(`[...document.querySelectorAll('[data-prospect-form] [name]')].map((f) => f.name)`);
  check("its Edit has the street address and the county, and the three people", ["address", "city", "state", "zip", "county", "decision_maker", "contact_name", "contact2_name"].every((f) => fields.includes(f)), JSON.stringify(fields));
  check("…and none of the old form's status, SIC, carrier, business figures or notes",
    !["status_id", "sic_code", "agency_id", "description", "location", "employees", "autos", "estimated_annual_premium", "client_note", "internal_notes"].some((f) => fields.includes(f)));
  await sean.fill('[data-prospect-form] input[name="address"]', "1502 W Main St");
  await sean.fill('[data-prospect-form] input[name="county"]', "Maricopa");
  await sean.fill('[data-prospect-form] input[name="dm_email"]', "bob@medford.test");
  await sean.click("[data-prospect-form] button[type=submit]");
  check("saving it changes the lead", Boolean(await until(() => sql(`select address || '|' || county || '|' || dm_email from public.leads where id = ${lead}`) === "1502 W Main St|Maricopa|bob@medford.test")));
  const card = await until(async () => { const t = await sean.ev(`document.querySelector('[data-prospect-info]')?.innerText ?? ''`); return /1502 W Main St/.test(t) ? t : null; });
  check("…and the card shows the street address and the county", /1502 W Main St/.test(card ?? "") && /Maricopa County/.test(card ?? ""), card);
  const cardText = await sean.ev(`document.querySelector('[data-contact-card]').innerText`);
  check("where the name stands is its call result, not an old status", /Lead-No Contact/i.test(cardText) && !/X-date|Phone appointment|^New$/im.test(cardText), cardText);

  section("The cargo list, in Settings");
  const adminPage = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1400, height: 1000 });
  await adminPage.go("/settings", 5000);
  await until(() => adminPage.ev(`!!document.querySelector('[data-cargo-import]')`));
  const doc = await adminPage.send("DOM.getDocument");
  const input = await adminPage.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "[data-cargo-import]" });
  await adminPage.send("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [cargoFile] });
  check("an administrator loads a list from a file: one a line, the heading and a repeat left out",
    Boolean(await until(() => sql(`select string_agg(name, '|' order by name) from public.cargo_types where name like ${lit(`${TAG}%`)}`) === `${TAG} Lumber|${TAG} Steel, coiled`)),
    sql(`select string_agg(name, '|' order by name) from public.cargo_types where name like ${lit(`${TAG}%`)}`));
  await adminPage.fill('[data-cargo-add] input', `${TAG} Livestock`);
  await adminPage.click("[data-cargo-add] button[type=submit]");
  check("…or adds one by name", Boolean(await until(() => adminPage.ev(`!!document.querySelector('[data-cargo-type=${JSON.stringify(`${TAG} Livestock`)}]')`))));
  await adminPage.click(`[data-cargo-type=${JSON.stringify(`${TAG} Livestock`)}] button`);
  check("…and takes one off", Boolean(await until(() => sql(`select count(*) from public.cargo_types where name = ${lit(`${TAG} Livestock`)}`) === "0")));

  section("The Business tab");
  await sean.go(`/leads/${lead}`, 5000);
  await sean.click("[data-edit-business]");
  await until(() => sean.ev(`!!document.querySelector('[data-business-form] select[name="location_ownership"]')`));
  await sean.fill('[data-business-form] input[name="location"]', "2");
  await sean.fill('[data-business-form] select[name="location_ownership"]', "lease");
  await sean.fill('[data-business-form] input[name="building_age"]', "15");
  await sean.fill('[data-business-form] input[name="building_stories"]', "2");
  await sean.fill('[data-business-form] input[name="building_acres"]', "1.5");
  await sean.fill('[data-business-form] input[name="employees_full_time"]', "15");
  await sean.fill('[data-business-form] input[name="employees_part_time"]', "5");
  await sean.fill('[data-business-form] input[name="subcontractors_pct"]', "10");
  await sean.fill('[data-business-form] input[name="autos"]', "11");
  await sean.ev(`document.querySelectorAll('[data-business-form] input[name="auto_types"][value="vans"], [data-business-form] input[name="auto_types"][value="delivery_trucks"]').forEach((c) => c.click())`);
  await sean.fill('[data-business-form] select[name="travel_radius"]', "100");
  const autosOrder = await sean.ev(`[...document.querySelectorAll('[data-business-form] [data-group="autos"] [name]')].map((e) => e.name).filter((n) => n !== "auto_types").join(",")`);
  check("Drivers comes before Travel radius in Autos", autosOrder.startsWith("autos,drivers,travel_radius"), autosOrder);
  await sean.fill('[data-business-form] input[name="drivers"]', "8");
  await sean.fill('[data-business-form] input[name="xmod"]', ".85");
  const cargoChoices = await sean.ev(`[...document.querySelectorAll('[data-business-form] select[name="cargo"] option')].map((o) => o.value)`);
  check("Cargo picks from the cargo list", cargoChoices.includes(`${TAG} Lumber`) && cargoChoices.includes(`${TAG} Steel, coiled`) && !cargoChoices.includes(`${TAG} Livestock`), JSON.stringify(cargoChoices));
  await sean.fill('[data-business-form] select[name="cargo"]', `${TAG} Steel, coiled`);
  await sean.fill('[data-business-form] input[name="dot_number"]', "DOT 1234567");
  await sean.fill('[data-business-form] input[name="annual_payroll"]', "$1.2M");
  await sean.fill('[data-business-form] select[name="claims_3yrs"]', "yes");
  check("the SIC code says what it means, from the SIC list", Boolean(await until(() => sean.ev(`(document.querySelector('[data-sic-meaning]')?.textContent ?? '').length > 3`))));
  await sean.click("[data-business-form] button[type=submit]");
  check("its details are saved", Boolean(await until(() => sql(`select location_ownership || '|' || building_acres || '|' || employees_full_time || '|' || array_to_string(auto_types, ',') || '|' || travel_radius from public.leads where id = ${lead}`)
    === "lease|1.50|15|vans,delivery_trucks|100")));
  check("…with the drivers and the XMOD", sql(`select drivers || '|' || xmod from public.leads where id = ${lead}`) === "8|0.85");
  check("…with the DOT# (its digits), cargo, annual payroll and claims", sql(`select dot_number || '|' || cargo || '|' || annual_payroll || '|' || claims_3yrs from public.leads where id = ${lead}`)
    === `1234567|${TAG} Steel, coiled|$1.2M|true`);
  const rows = await until(async () => {
    const r = await sean.ev(`Object.fromEntries([...document.querySelectorAll('[data-tab-panel="business"] .grid')].map((x) => [x.children[0]?.innerText.trim(), x.children[1]?.innerText.trim()]))`);
    return /Lease/.test(r?.Locations ?? "") ? r : null;
  });
  check("…and read as one line each", rows?.Locations === "2 · Lease · 15 years old, 2 stories, 1.5 acres" && rows.Employees === "20 (15 full-time, 5 part-time)"
    && rows["Sub-contractors"] === "10%" && rows.Autos === "11 · Vans, Delivery trucks · 8 drivers · within 100 miles", JSON.stringify(rows));
  check("…with no county (it is on Prospect Info)", rows && !("County" in rows));
  check("…and the new ones in their places", rows?.["DOT#"] === "1234567" && rows.Cargo === `${TAG} Steel, coiled` && rows["Annual payroll"] === "$1.2M" && rows["Claims last 3 yrs"] === "Yes"
    && rows.XMOD === "0.85" && Object.keys(rows).join(",").includes("Autos,DOT#,Cargo,XMOD,Sales volume,Annual payroll") && Object.keys(rows).join(",").includes("Est. annual premium,Claims last 3 yrs"), JSON.stringify(Object.keys(rows ?? {})));
  await shot("lead-page");

  section("Print");
  const printed = await fetch(`${APP_URL}/api/leads/${lead}/sheet`, { headers: { cookie } });
  const html = await printed.text();
  check("Print gives the lead sheet the client gets, and opens the print dialog", printed.status === 200 && /Lead sheet/i.test(html) && html.includes(`${TAG} Medford Knife and Tool`)
    && html.includes("print()") && html.includes("20 (15 full-time, 5 part-time)") && html.includes("1234567") && html.includes("Claims last 3 yrs") && html.includes("8 drivers") && /XMOD[\s\S]{0,200}0\.85/.test(html), `${printed.status} ${html.slice(0, 120)}`);
  check("…not to someone signed out", (await fetch(`${APP_URL}/api/leads/${lead}/sheet`, { redirect: "manual" })).status !== 200);

  section("Policy Files");
  await sean.click('[role=tab][data-tab="files"]');
  await until(() => sean.ev(`!!document.querySelector('[data-file-input]')`));
  const { root } = await sean.send("DOM.getDocument");
  const { nodeId } = await sean.send("DOM.querySelector", { nodeId: root.nodeId, selector: "[data-file-input]" });
  await sean.send("DOM.setFileInputFiles", { nodeId, files: [pdf] });
  const fileId = Number(await until(() => sql(`select id from public.documents where lead_id = ${lead} and name = 'policy.pdf'`) || null, { timeout: 15000 }));
  check("a file added on the tab is kept with the lead", fileId > 0);
  check("…and listed there, by whom and when", Boolean(await until(() => sean.ev(`(document.querySelector('[data-file="${fileId}"]')?.innerText ?? '').includes('policy.pdf')`))));
  const opened = await fetch(`${APP_URL}/api/files/${fileId}`, { headers: { cookie }, redirect: "manual" });
  check("…opened through a short-lived link", opened.status === 307 || opened.status === 302 || opened.status === 303, String(opened.status));
  const shown = await fetch(opened.headers.get("location") ?? "about:blank").catch(() => null);
  check("…a PDF shown in the browser, not downloaded", !/download=/.test(opened.headers.get("location") ?? "") && shown?.headers.get("content-type") === "application/pdf"
    && !/attachment/i.test(shown?.headers.get("content-disposition") ?? ""), `${opened.headers.get("location")} · ${shown?.headers.get("content-disposition")}`);
  const saved = await fetch(`${APP_URL}/api/files/${fileId}?download=1`, { headers: { cookie }, redirect: "manual" });
  check("…and downloaded, under its own name, when asked", /download=policy\.pdf/.test(saved.headers.get("location") ?? ""), saved.headers.get("location"));
  await sean.click(`[data-file="${fileId}"] [data-file-open]`);
  const viewer = `[data-file-viewer="${fileId}"]`;
  check("its name opens it in Lighthouse's viewer", Boolean(await until(() => sean.ev(`document.querySelector('${viewer} iframe[data-file-frame]')?.getAttribute('src') === '/api/files/${fileId}'`))));
  check("…with Open in new tab and Download beside it", (await sean.ev(`[document.querySelector('${viewer} [data-file-open-tab]')?.getAttribute('href'), document.querySelector('${viewer} [data-file-open-tab]')?.target,
    document.querySelector('${viewer} [data-file-download]')?.getAttribute('href')].join(' ')`)) === `/api/files/${fileId} _blank /api/files/${fileId}?download=1`);
  await shot("file-viewer");
  await sean.click(`${viewer} button`, "Close");
  check("…and closes back to the lead", Boolean(await until(() => sean.ev(`!document.querySelector('${viewer}')`))));
  check("the download button downloads it", (await sean.ev(`document.querySelector('[data-file="${fileId}"] [data-file-download]')?.getAttribute('href')`)) === `/api/files/${fileId}?download=1`);
  const printedAgain = await (await fetch(`${APP_URL}/api/leads/${lead}/sheet`, { headers: { cookie } })).text();
  const sheetFile = printedAgain.match(new RegExp(`https?://[^"]+/sheet/[^"]+/files/${fileId}`))?.[0];
  check("…and in the sheet the client gets, as a link", /Policy files/i.test(printedAgain) && Boolean(sheetFile));
  const fromSheet = sheetFile ? await fetch(sheetFile.replace(/^https?:\/\/[^/]+/, APP_URL), { redirect: "manual" }) : null;
  check("…which opens the PDF in the client's browser too", Boolean(fromSheet?.headers.get("location")) && !/download=/.test(fromSheet.headers.get("location")), fromSheet?.headers.get("location"));

  section("Send to a manager");
  await sean.click("[data-send-lead]");
  await until(() => sean.ev(`!!document.querySelector('[data-send-lead-form] select[name="to"]')`));
  await sean.fill('[data-send-lead-form] select[name="to"]', String(MIKE));
  await sean.fill('[data-send-lead-form] textarea[name="note"]', "Hot lead: owner wants a quote");
  await sean.click("[data-send-lead-form] button[type=submit]");
  check("sent: the lead is the other manager's, and they are told with the note", Boolean(await until(() => sql(`select assigned_user_id from public.leads where id = ${lead}`) === String(MIKE)))
    && /owner wants a quote/.test(sql(`select coalesce(string_agg(body, ' '), '') from public.notifications where user_id = ${MIKE} and title = ${lit(`Lead to call: ${TAG} Medford Knife and Tool`)}`)));
  sql(`update public.leads set assigned_user_id = ${SEAN} where id = ${lead}`);

  section("A call-back reminder, on my own calendar");
  const reminder = Number(sql(`insert into public.reminders (lead_id, user_id, remind_at, note) values (${lead}, ${SEAN}, now() + interval '1 day', 'Ask for Bob') returning id`));
  await sean.go(`/leads/${lead}`, 5000);
  const links = await until(() => sean.ev(`(() => { const r = document.querySelector('[data-reminder="${reminder}"] [data-reminder-calendar]'); return r ? [...r.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]) : null; })()`));
  check("it can be added to Google, Outlook or the calendar on a phone or desktop", JSON.stringify((links ?? []).map((l) => l[0])) === JSON.stringify(["Google", "Outlook", "Apple"]), JSON.stringify(links));
  const ics = await fetch(`${APP_URL}/api/reminders/${reminder}/ics`, { headers: { cookie } });
  const icsText = (await ics.text()).replace(/\r\n /g, "");
  check("…the file a calendar opens: the call back, with the lead to open", /text\/calendar/.test(ics.headers.get("content-type") ?? "") && icsText.includes(`SUMMARY:Call back: ${TAG} Medford Knife and Tool`) && icsText.includes(`/leads/${lead}`), icsText.slice(0, 300));

  section("The appointment date picker shows the project's calendar");
  await sean.ev(`[...document.querySelectorAll('button[aria-pressed]')].find((b) => b.textContent.trim() === 'Appointment')?.click()`);
  await until(() => sean.ev(`!!document.querySelector('input[aria-label="Appointment date"]')`));
  // A real click, as a person makes it: it moves the cursor into the field (the result just picked put it in
  // the X-date), where a scripted click would leave it outside the picker and the picker would close.
  await until(async () => {
    await sean.mouseClick('input[aria-label="Appointment date"]');
    await sleep(200);
    return sean.ev(`!!document.querySelector('[aria-label="Calendar"]')`);
  }, { timeout: 6000 });
  const blocked = await until(() => sean.ev(`document.querySelector('[data-iso="${tomorrow}"]')?.dataset.blocked ?? null`), { timeout: 8000 });
  check("tomorrow, partly blocked out on the project's calendar, is marked so", blocked === "part",
    `${blocked} | input: ${await sean.ev(`!!document.querySelector('input[aria-label="Appointment date"]')`)} | dialogs: ${await sean.ev(`document.querySelectorAll('[role=dialog]').length`)} | open: ${await sean.ev(`!!document.querySelector('[aria-label="Calendar"]')`)} | cell: ${await sean.ev(`document.querySelector('[data-iso="${tomorrow}"]')?.getAttribute('aria-label') ?? 'none'`)} | first: ${await sean.ev(`document.querySelector('[data-iso]')?.dataset.iso ?? 'none'`)}`);
  await sean.hover(`[data-iso="${tomorrow}"]`);
  const told = await until(() => sean.ev(`(document.querySelector('[data-picker-day]')?.innerText ?? '').includes('Staff meeting') ? document.querySelector('[data-picker-day]').innerText : null`));
  check("…and pointing at it says which hours, and why", /Blocked · 10:00 AM – 1:00 PM · Staff meeting/.test(told ?? ""), told);
  await shot("picker-calendar");
  sean.close();

  section("A manager's side menu");
  const mike = await (await browser.newContext({ as: "mike@beacon.test" })).newPage({ width: 1400, height: 1000 });
  await mike.go("/", 5000);
  const menu = await mike.ev(`[...document.querySelectorAll('nav a')].map((a) => a.textContent.trim())`);
  check("no Clients, Projects, Reports or X-Dates by Month", !menu.some((m) => ["Clients", "Projects", "Reports", "X-Dates by Month"].includes(m)) && menu.includes("My Projects"), JSON.stringify(menu));
  await mike.go("/clients", 4000);
  check("…and the pages say they are not theirs", /don.t have access|not available|no access/i.test(await mike.text()));
} finally {
  browser.close();
  const files = sql(`select coalesce(string_agg(storage_path, ','), '') from public.documents where lead_id = ${lead}`);
  if (files) await adminClient().storage.from("lead-files").remove(files.split(","));
  sql(`delete from public.documents where lead_id = ${lead}`);
  sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.leads where id = ${lead}`);
  sql(`delete from public.projects where id = ${APPT}`);
  sql(`delete from public.companies where id = ${company}`);
  sql(`delete from public.cargo_types where name ilike ${lit(`${TAG}%`)}`);
}

finish("lead page");
