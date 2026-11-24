/**
 * Campaign Types' import and export (Sean, Nov 2026, phase 3): a client with a campaign type has its leads exported
 * laid out as its lead sheet is (the parts it turns off left out, those it renames renamed, its own fields as columns),
 * its import template the same, and that file imported into another of its projects comes back the same: the renamed
 * date into the Ultimate X-Date, its own answers each by kind. An Insurance client's export is as it was.
 *
 *   node tests/run.mjs tests/e2e/campaign-import-export.test.mjs
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `CIE${Date.now()}`;
const fields = {
  builtin: { ultimate_xdate: { label: "Contract renewal" }, xmod: { hidden: true }, dot_number: { hidden: true }, tab_coverage: { label: "Systems" } },
  custom: [
    { id: "desk", label: "Desktops", type: "number" },
    { id: "share", label: "Managed share", type: "percent" },
    { id: "plat", label: "Platforms", type: "multi", options: ["Microsoft 365", "Google, Workspace", "Zoom"] },
    { id: "host", label: "Hosting", type: "select", options: ["Azure", "AWS"] },
    { id: "msp", label: "Has an MSP", type: "yesno" },
  ],
};
const typeId = Number(sql(`insert into public.campaign_types (name, fields) values (${lit(`IT ${TAG}`)}, ${lit(JSON.stringify(fields))}::jsonb) returning id`));
const co = Number(sql(`insert into public.companies (name, campaign_type_id) values (${lit(`${TAG} Tech Partners`)}, ${typeId}) returning id`));
const project = (name, company = co) => Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} ${name}`)}, ${company},
  (select id from public.project_types where code = 'DBDV'), 1) returning id`));
const FROM = project("From");
const TO = project("To");
const ANSWERS = { desk: 42, share: 12.5, plat: ["Google, Workspace", "Zoom"], host: "AWS", msp: true };
const LEAD = Number(sql(`insert into public.leads (company_name, project_id, phone, xmod, custom) values (${lit(`${TAG} Acme Dental`)}, ${FROM}, '6025550111', 0.9,
  ${lit(JSON.stringify(ANSWERS))}::jsonb) returning id`));
sql(`insert into public.insurance_details (lead_id, ultimate_xdate) values (${LEAD}, '2027-04-01')`);
const insCo = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Capital Ins`)}) returning id`));
const INS = project("Insurance", insCo);
sql(`insert into public.leads (company_name, project_id, xmod) values (${lit(`${TAG} Ins Co`)}, ${INS}, 0.85)`);
const dir = mkdtempSync(path.join(tmpdir(), "cie-"));

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1400, height: 950 });
  await admin.go("/imports", 6000);

  section("Exported as its campaign type");
  const csv = String(await admin.ev(`fetch('/api/projects/${FROM}/export').then((r) => r.text())`));
  const head = csv.split(/\r?\n/)[0];
  check("the key date as Contract renewal, XMOD and DOT Number left out, its own fields as columns",
    head.includes("Contract renewal") && !head.includes("Ultimate XDate") && !/XMOD|DOT Number/.test(head)
      && ["Desktops", "Managed share", "Platforms", "Hosting", "Has an MSP"].every((h) => head.includes(h)), head);
  const row = csv.split(/\r?\n/).find((l) => l.includes("Acme Dental")) ?? "";
  check("…its answers as a list writes them", ["4/1/2027", "42", "12.5%", '"Google, Workspace; Zoom"', "AWS", "Yes"].every((v) => row.includes(v)) && !row.includes("0.90"), row);
  const ins = String(await admin.ev(`fetch('/api/projects/${INS}/export').then((r) => r.text())`)).split(/\r?\n/)[0];
  check("an Insurance client's: as it was", ins.includes("Ultimate XDate") && ins.includes("XMOD") && !ins.includes("Contract renewal"), ins.slice(0, 200));

  section("Its import template");
  await admin.fill('select[name="project_id"]', String(TO));
  const template = await until(() => admin.ev(`(() => { const a = document.querySelector('[data-import-template]'); return a?.dataset.importTemplate ? { text: a.textContent.trim(), head: decodeURIComponent(a.getAttribute('href').split(',').slice(1).join(',')) } : null; })()`));
  check("the type's template for its project", /Download IT .* template/.test(template?.text ?? "") && template.head.includes("Contract renewal") && template.head.includes("Platforms") && !template.head.includes("XMOD"),
    JSON.stringify(template)?.slice(0, 300));

  section("Imported into another of its projects");
  const file = path.join(dir, "export.csv");
  writeFileSync(file, csv);
  const { root } = await admin.send("DOM.getDocument");
  const { nodeId } = await admin.send("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[name="file"]' });
  await admin.send("DOM.setFileInputFiles", { nodeId, files: [file] });
  await admin.click("button[type=submit]", "Import leads");
  const said = await admin.waitToast(/Imported 1 of 1/, 20000);
  check("it imports", /Imported 1 of 1/.test(said ?? ""), said);
  const back = sql(`select l.custom::text || '|' || coalesce(i.ultimate_xdate::text, '') from public.leads l left join public.insurance_details i on i.lead_id = l.id where l.project_id = ${TO}`);
  const [custom, renewal] = back.split("|");
  const got = JSON.parse(custom || "{}");
  check("…its answers come back the same", Object.entries(ANSWERS).every(([k, v]) => JSON.stringify(got[k]) === JSON.stringify(v)), custom);
  check("…and Contract renewal as its Ultimate X-Date", renewal === "2027-04-01", back);
} finally {
  browser.close();
  rmSync(dir, { recursive: true, force: true });
  sql(`delete from public.leads where project_id in (${FROM}, ${TO}, ${INS})`);
  sql(`delete from public.import_batches where project_id in (${FROM}, ${TO}, ${INS})`);
  sql(`delete from public.projects where id in (${FROM}, ${TO}, ${INS})`);
  sql(`delete from public.companies where id in (${co}, ${insCo})`);
  sql(`delete from public.campaign_types where id = ${typeId}`);
}

finish("campaign import export");
