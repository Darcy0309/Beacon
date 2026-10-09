/**
 * The Coverage tab as the client asked: "Ultimate XDate" and "Agency" on
 * top, then the policy lines (Liability / Package, Workers comp, Auto, Group
 * health, Personal lines) as Policy line → X-Date → Carrier; editing them
 * from the lead sheet, the carrier suggested as it is typed from the
 * Insurance Cos. list; the Ultimate X-Date and the liability carrier applied
 * to liability, workers comp and auto at once, and the years with the
 * agency (the 9/24 lead record page); and that list filled from a CSV of
 * carrier names.
 *
 * Runs on its own test client and removes everything it made.
 *
 *   npm run test:e2e      (SHOTS=<dir> to keep screenshots)
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const RUN = Date.now();
const TAG = `CV-TEST ${RUN}`;
const SHOTS = process.env.SHOTS;
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const CARRIERS = [`Zephyr Mutual ${RUN}`, `Zephyr Casualty ${RUN}`, `Quokka Insurance ${RUN}`];
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} DBDev`)}, ${company}, (select id from public.project_types where code='DBDV'), 1) returning id`));
const lead = Number(sql(`insert into public.leads (company_name, phone, project_id, assigned_user_id)
  values (${lit(`${TAG} Calvary Church`)}, '310-829-3291', ${project}, ${SEAN}) returning id`));
sql(`insert into public.insurance_details (lead_id, ultimate_xdate, agency_name, pkg_xdate, wc_xdate, wc_carrier)
  values (${lead}, '2027-12-20', 'Garry Insurance', '2027-12-20', '2027-12-20', 'Amtrust Ins Co Of Ks Inc')`);
const coverage = () => JSON.parse(sql(`select row_to_json(i) from public.insurance_details i where lead_id = ${lead}`));

const browser = await launchBrowser({ mouse: true });
const shot = (page, name) => (SHOTS ? page.screenshot(`${SHOTS}/${name}.png`) : null);

try {
  section("Carriers from a CSV");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage();
  await admin.go("/insurance-companies", 4000);
  const dir = mkdtempSync(path.join(tmpdir(), "carriers-"));
  const file = path.join(dir, "carriers.csv");
  writeFileSync(file, ["Carrier,State", ...CARRIERS.map((c) => `"${c}",AZ`), `"${CARRIERS[0].toUpperCase()}",TX`, "Travelers,OH"].join("\n"));
  const { root } = await admin.send("DOM.getDocument");
  const { nodeId } = await admin.send("DOM.querySelector", { nodeId: root.nodeId, selector: "input[data-carrier-import]" });
  await admin.send("DOM.setFileInputFiles", { nodeId, files: [file] });
  const said = await admin.waitToast(/carriers? added/, 10000);
  check("importing a CSV adds its carriers to the list", sql(`select count(*) from public.agencies where name like ${lit(`%${RUN}`)}`) === "3", said);
  check("…a repeat in the file, or a carrier already on file, is skipped", /3 carriers added, \d+ already on file/.test(said ?? ""), said);

  section("The Coverage tab");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage();
  await sean.go(`/leads/${lead}`, 4000);
  await sean.click('[role=tab][data-tab="coverage"]');
  const tab = await sean.ev(`(() => { const p = document.querySelector('[data-tab-panel="coverage"]');
    return { rows: [...p.querySelectorAll('.grid > span:first-child')].map((x) => x.innerText),
      head: [...p.querySelectorAll('[data-policy-lines] th')].map((x) => x.innerText.trim()),
      lines: [...p.querySelectorAll('[data-policy-line]')].map((r) => [...r.cells].map((c) => c.innerText.trim())) }; })()`);
  check("“Ultimate XDate” and “Agency” on top", tab.rows[0] === "Ultimate XDate" && tab.rows[1] === "Agency", JSON.stringify(tab.rows));
  check("the policy lines read Policy line → X-Date → Carrier", JSON.stringify(tab.head.map((h) => h.toUpperCase())) === JSON.stringify(["POLICY LINE", "X-DATE", "CARRIER"]), JSON.stringify(tab.head));
  check("Liability / Package, Workers comp, Auto, Group health and Personal lines are always listed",
    JSON.stringify(tab.lines.map((l) => l[0])) === JSON.stringify(["Liability / Package", "Workers comp", "Auto", "Group health", "Personal lines"]), JSON.stringify(tab.lines));
  check("…each with its X-date, then its carrier", JSON.stringify(tab.lines[1]) === JSON.stringify(["Workers comp", "Dec 20, 2027", "Amtrust Ins Co Of Ks Inc"]), JSON.stringify(tab.lines[1]));
  await shot(sean, "coverage-tab");

  section("Editing coverage, with the carrier suggested");
  await sean.mouseClick("[data-edit-coverage]");
  await until(() => sean.ev(`!!document.querySelector('[role=dialog] [data-coverage-line="personal"]')`));
  await sean.fill('[role=dialog] [data-suggest="personal_lines_carrier"] input', "zeph");
  const offered = await until(() => sean.ev(`[...document.querySelectorAll('[data-suggest="personal_lines_carrier"] [role=option]')].map((o) => o.textContent)`).then((o) => o.length && o));
  check("typing “zeph” suggests the carriers starting with it", JSON.stringify(offered) === JSON.stringify([CARRIERS[1], CARRIERS[0]]), JSON.stringify(offered));
  await sean.key("ArrowDown"); // from the first suggestion to the second
  await sean.key("Enter");
  check("…and the arrow keys and Enter take one", await sean.ev(`document.querySelector('[data-suggest="personal_lines_carrier"] input').value`) === CARRIERS[0]);
  await sean.fill('[role=dialog] input[aria-label="Personal lines X-Date"]', "3/1/27");
  await sean.ev("document.activeElement.blur()");
  await sean.fill('[role=dialog] [data-suggest="auto_carrier"] input', "Acme Made-Up Carrier");
  await sean.ev("document.activeElement.blur()");
  check("a carrier not on the list is flagged, so it can be checked", Boolean(await until(() => sean.ev(`!!document.querySelector('[data-suggest="auto_carrier"] [data-not-listed]')`))));
  await sean.fill('[role=dialog] input[name="agency_name"]', "Fipps & Co Insurance");
  await shot(sean, "coverage-form");
  await sean.click("[role=dialog] button[type=submit]");
  check("saving says so", /Coverage saved/.test((await sean.waitToast(/Coverage saved/, 8000)) ?? ""));
  const saved = await until(() => { const c = coverage(); return c.personal_lines_carrier === CARRIERS[0] && c; });
  check("…and keeps the new line, the agency and what was there",
    saved && saved.personal_lines_xdate === "2027-03-01" && saved.auto_carrier === "Acme Made-Up Carrier" && saved.agency_name === "Fipps & Co Insurance"
    && saved.wc_carrier === "Amtrust Ins Co Of Ks Inc" && saved.ultimate_xdate === "2027-12-20", JSON.stringify(saved));
  await sean.click('[role=tab][data-tab="coverage"]');
  const after = await until(() => sean.ev(`[...document.querySelectorAll('[data-policy-line="personal"] td')].map((c) => c.innerText.trim())`).then((r) => r[2] === CARRIERS[0] && r));
  check("the tab shows it", JSON.stringify(after) === JSON.stringify(["Personal lines", "Mar 1, 2027", CARRIERS[0]]), JSON.stringify(after));

  section("Apply to all, and years with the agency");
  await sean.mouseClick("[data-edit-coverage]");
  await until(() => sean.ev(`!!document.querySelector('[role=dialog] [data-apply-date]')`));
  await sean.fill('[role=dialog] input[aria-label="Ultimate XDate"]', "01/01/2028");
  await sean.ev("document.activeElement.blur()");
  await until(() => sean.ev(`document.querySelector('[role=dialog] input[name="ultimate_xdate"]')?.value === "2028-01-01"`));
  await sean.click("[role=dialog] [data-apply-date]");
  const dates = await until(() => sean.ev(`["pkg_xdate", "wc_xdate", "auto_xdate", "health_xdate"].map((n) => document.querySelector('[role=dialog] input[name="' + n + '"]')?.value)`)
    .then((d) => d[0] === "2028-01-01" && d));
  check("Apply date: the Ultimate X-Date fills liability, workers comp and auto (and nothing else)", JSON.stringify(dates) === JSON.stringify(["2028-01-01", "2028-01-01", "2028-01-01", ""]), JSON.stringify(dates));
  await sean.fill('[role=dialog] [data-suggest="pkg_carrier"] input', CARRIERS[2]);
  await sean.click("[role=dialog] [data-apply-carrier]");
  const carriers = await sean.ev(`["pkg_carrier", "wc_carrier", "auto_carrier"].map((n) => document.querySelector('[role=dialog] [data-suggest="' + n + '"] input').value)`);
  check("Apply carrier: the liability carrier fills workers comp and auto", carriers.every((c) => c === CARRIERS[2]), JSON.stringify(carriers));
  await sean.fill('[role=dialog] input[name="agency_years"]', "6");
  await sean.click("[role=dialog] button[type=submit]");
  const applied = await until(() => { const c = coverage(); return c.agency_years === 6 && c; });
  check("…saved: the dates, the carriers and the years with the agency",
    applied && ["pkg_xdate", "wc_xdate", "auto_xdate"].every((k) => applied[k] === "2028-01-01") && ["pkg_carrier", "wc_carrier", "auto_carrier"].every((k) => applied[k] === CARRIERS[2]),
    JSON.stringify(applied));
  await sean.click('[role=tab][data-tab="coverage"]');
  check("the tab shows how long they have been with the agency",
    Boolean(await until(async () => /Fipps & Co Insurance · 6 years with them/.test(await sean.ev(`document.querySelector('[data-tab-panel="coverage"]')?.innerText ?? ''`)))));

  section("Who edits it");
  const tyler = await (await browser.newContext({ as: "agent@beacon.test" })).newPage();
  await tyler.go(`/leads/${lead}`, 4000);
  check("someone not on the name sees the coverage, but no Edit coverage", await tyler.ev(`!document.querySelector('[data-edit-coverage]') && !!document.querySelector('[data-policy-line="personal"]')`));
} finally {
  browser.close();
  sql(`delete from public.activity_log where entity = 'lead' and entity_id = ${lead}`);
  sql(`delete from public.leads where id = ${lead}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
  sql(`delete from public.agencies where name like ${lit(`%${RUN}`)}`);
}

finish("coverage");
