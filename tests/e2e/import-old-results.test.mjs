/**
 * An old-system list loaded as it is (Sean, Nov 2026, BTC): its call results in the new system's names, on the
 * lead and in the export ("Call 0 - Call 9 … Viable-No Contact, X-Date Hot Lead … Lead-Hot Lead, X-Date-Lead …
 * Lead-Hot Lead"); a name with only a DB Dev result loaded onto the appointment project goes to its DB Dev
 * project (602-232-2244: "This wasn't a lead … should've been imported as Viable-No Contact"); and the producer
 * on each name is the project's Agent, not the old system's ("should've changed to Steve Kirchen").
 *
 *   node tests/run.mjs tests/e2e/import-old-results.test.mjs
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { check, finish, section } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `IOR-TEST ${Date.now()}`;
const type = (c) => `(select id from public.project_types where code = '${c}')`;
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} BTC`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, contact_name)
  values (${lit(`${TAG} BTC Appts`)}, ${company}, ${type("APPT")}, 1, 'Steve Kirchen') returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, contact_name, appt_project_id)
  values (${lit(`${TAG} BTC DBDev`)}, ${company}, ${type("DBDV")}, 1, 'Steve Kirchen', ${APPT}) returning id`));
const dir = mkdtempSync(path.join(tmpdir(), "ior-"));
const HEAD = "Company,Phone,Producer Name,Package XDate,Call Result DBDV,Call Result Appt";
const apptFile = path.join(dir, "btc-appts.csv");
writeFileSync(apptFile, [HEAD,
  `"${TAG} Renewal Only",602-232-2244,Jeff McDonald,3/1/2027,Call 1,`,
  `"${TAG} Hot",602-555-0301,Jeff McDonald,4/1/2027,X-Date Hot Lead,`,
  `"${TAG} X Lead",602-555-0302,Jeff McDonald,5/1/2027,X-Date-Lead,`,
  `"${TAG} Worked Lead",602-555-0303,Jeff McDonald,6/1/2027,Call 3,XD-Call 2`,
].join("\n"));
const dbdvFile = path.join(dir, "btc-dbdev.csv");
writeFileSync(dbdvFile, [HEAD, `"${TAG} Called Seven",602-555-0304,Jeff McDonald,7/1/2027,Call 7,`].join("\n"));
const lead = (name) => sql(`select case when l.project_id = ${DBDV} then 'DBDev' when l.project_id = ${APPT} then 'Appts' else '?' end
  || '|' || coalesce(r.name, '') || '|' || coalesce(l.call_result_dbdv, '') || '|' || coalesce(l.call_result_appt, '') || '|' || coalesce(l.producer_name, '')
  from public.leads l left join public.call_results r on r.id = l.result_id where l.company_name = ${lit(`${TAG} ${name}`)}`);

async function chooseFile(page, csv, into) {
  await page.go("/imports", 4000);
  await page.fill('select[name="project_id"]', String(into));
  const { root } = await page.send("DOM.getDocument");
  const { nodeId } = await page.send("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[name="file"]' });
  await page.send("DOM.setFileInputFiles", { nodeId, files: [csv] });
}

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1280, height: 900 });

  section("An old list loaded onto the appointment project");
  await chooseFile(admin, apptFile, APPT);
  await admin.click("button[type=submit]", "Import leads");
  const said = await admin.waitToast(/Imported 4 of 4/, 20000);
  check("the list imports", /Imported 4 of 4/.test(said ?? ""), said);
  check("a name with only renewal dates and Call 1: a DB Dev name, Viable-No Contact (Viable-CallBack), on the DB Dev project",
    lead("Renewal Only") === "DBDev|Viable-CallBack|Viable-CallBack||Steve Kirchen", lead("Renewal Only"));
  check("…and the import says so", /1 row was a DB Dev name[\s\S]*BTC DBDev/.test((await admin.waitToast(/DB Dev name/, 8000)) ?? ""), await admin.toasts());
  check("X-Date Hot Lead: a Lead-Hot Lead, on to the appointment project as Lead-No Contact",
    lead("Hot") === "Appts|Lead-No Contact|Lead-Hot Lead|Lead-No Contact|Steve Kirchen", lead("Hot"));
  check("X-Date-Lead: a Lead-Hot Lead too", lead("X Lead") === "Appts|Lead-No Contact|Lead-Hot Lead|Lead-No Contact|Steve Kirchen", lead("X Lead"));
  check("a name worked as a lead (XD-Call 2): stays a lead, its DB Dev result in the new name",
    lead("Worked Lead") === "Appts|Lead-No Contact|Viable-CallBack|Lead-No Contact|Steve Kirchen", lead("Worked Lead"));

  section("An old list loaded onto the DB Dev project");
  await chooseFile(admin, dbdvFile, DBDV);
  await admin.click("button[type=submit]", "Import leads");
  check("it imports", /Imported 1 of 1/.test((await admin.waitToast(/Imported 1 of 1/, 20000)) ?? ""));
  check("Call 7: Viable-No Contact (Viable-CallBack), the project's Agent as producer", lead("Called Seven") === "DBDev|Viable-CallBack|Viable-CallBack||Steve Kirchen", lead("Called Seven"));

  section("The export");
  const csv = await admin.ev(`fetch('/api/projects/${DBDV}/export?both=1').then((r) => r.text())`);
  const lines = String(csv ?? "").split(/\r?\n/);
  const head = lines[0].split(",");
  const col = (name) => head.indexOf(name);
  const rowOf = (phone) => lines.find((l) => l.includes(phone))?.split(",") ?? [];
  const r = rowOf("602-232-2244");
  check("602-232-2244: DB Dev Viable-CallBack, no appointment result, Steve Kirchen",
    r[col("Call Result DBDV")] === "Viable-CallBack" && r[col("Call Result Appt")] === "" && r[col("Producer Name")] === "Steve Kirchen", JSON.stringify([r[col("Call Result DBDV")], r[col("Call Result Appt")], r[col("Producer Name")]]));
  const h = rowOf("602-555-0301");
  check("the hot lead: Lead-Hot Lead under DB Dev, not the old name", h[col("Call Result DBDV")] === "Lead-Hot Lead" && h[col("Call Result Appt")] === "Lead-No Contact",
    JSON.stringify([h[col("Call Result DBDV")], h[col("Call Result Appt")]]));
} finally {
  browser.close();
  sql(`delete from public.leads where project_id in (${APPT}, ${DBDV})`);
  sql(`delete from public.import_batches where project_id in (${APPT}, ${DBDV})`);
  sql(`delete from public.projects where id in (${DBDV}, ${APPT})`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("import old results");
