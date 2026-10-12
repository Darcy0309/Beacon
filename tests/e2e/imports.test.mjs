/**
 * Importing a list from the old system (Sean, Oct 2026): its old call
 * results become the new ones without editing the file; one the system does
 * not know is said so, and that name starts as a new one; "n/a", "no site"
 * and the like in a field are left blank, and only real web and email
 * addresses are kept.
 *
 * Removes everything it made.
 *
 *   node tests/e2e/imports.test.mjs
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `IMP-E2E ${Date.now()}`;
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Co`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} DBDev`)}, ${company},
  (select id from public.project_types where code = 'DBDV'), 1) returning id`));
const file = path.join(mkdtempSync(path.join(tmpdir(), "import-")), "list.csv");
const NEW_SIC = `9${String(Date.now()).slice(-3)}-77`;
writeFileSync(file, [
  "Company,Phone,Website,Email,Call Result DBDV,SICCode,SICDesc",
  `"${TAG} Alpha",602-555-0101,n/a,no email,Left Message,1711,`,
  `"${TAG} Beta",602-555-0102,www.betaplumbing.com,bob@beta.com,DNC,,"Plumbing, Heating & Air-Conditioning"`,
  `"${TAG} Gamma",602-555-0103,No Site,N/A,Callback,${NEW_SIC},${TAG} widgets`,
  `"${TAG} Delta",602-555-0104,see notes,dave at delta,Old Weird Result,,Nothing like any SIC`,
].join("\n"));
const sic = (name) => sql(`select coalesce(sic_code, '') || '|' || coalesce(description, '') from public.leads where company_name = ${lit(`${TAG} ${name}`)}`);
const row = (name) => sql(`select coalesce(l.website, '') || '|' || coalesce(l.email, '') || '|' || r.name from public.leads l join public.call_results r on r.id = l.result_id
  where l.company_name = ${lit(`${TAG} ${name}`)}`);

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1280, height: 900 });
  await admin.go("/imports", 4000);
  await admin.fill('select[name="project_id"]', String(project));
  const { root } = await admin.send("DOM.getDocument");
  const { nodeId } = await admin.send("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[name="file"]' });
  await admin.send("DOM.setFileInputFiles", { nodeId, files: [file] });
  await admin.click("button[type=submit]", "Import leads");
  const said = await admin.waitToast(/Imported 4 of 4/, 15000);

  section("Old call results");
  check("the list imports", /Imported 4 of 4/.test(said ?? ""), said);
  check("old results read as the new ones, without editing the file",
    row("Alpha").endsWith("|Viable-Left Message") && row("Beta").endsWith("|DoNotCall") && row("Gamma").endsWith("|Viable-CallBack"),
    [row("Alpha"), row("Beta"), row("Gamma")].join(" / "));
  check("one the system does not know: the name starts as a new one", row("Delta").endsWith("|Viable-CallBack"), row("Delta"));
  check("…and the import says which", Boolean(await until(async () => /doesn't recognise[\s\S]*Old Weird Result/i.test((await admin.toasts()) ?? ""), { timeout: 8000 })), await admin.toasts());

  section("Empty-looking fields");
  check("“n/a”, “no site”, “no email” are left blank", row("Alpha").startsWith("||") && row("Gamma").startsWith("||"), `${row("Alpha")} / ${row("Gamma")}`);
  check("real web and email addresses are kept", row("Beta").startsWith("www.betaplumbing.com|bob@beta.com|"), row("Beta"));
  check("…and what is not one is not", row("Delta").startsWith("||"), row("Delta"));

  section("SIC code and description");
  check("a code alone is kept", sic("Alpha") === "1711|", sic("Alpha"));
  check("a description alone finds its code in the SIC list", sic("Beta") === "1711|", sic("Beta"));
  check("a code and description the list does not have are added to it",
    sic("Gamma").startsWith(`${NEW_SIC}|`) && sql(`select description from public.sic_codes where code = ${lit(NEW_SIC)}`) === `${TAG} widgets`, sic("Gamma"));
  check("a description with no code to match is kept on the lead", sic("Delta") === "|Nothing like any SIC", sic("Delta"));

  section("The SIC list in Settings");
  await admin.go("/settings", 4000);
  const before = Number((await admin.ev(`document.querySelector('[data-sic-count]')?.textContent ?? '0'`)).replace(/\D/g, ""));
  const listFile = path.join(path.dirname(file), "sic.csv");
  writeFileSync(listFile, ["SICCode,SICDesc", `${NEW_SIC},${TAG} widgets and gadgets`, `8${String(Date.now()).slice(-3)}-11,${TAG} new trade`].join("\n"));
  const doc = await admin.send("DOM.getDocument");
  const input = await admin.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "input[data-sic-import]" });
  await admin.send("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [listFile] });
  const loaded = await admin.waitToast(/SIC code/, 10000);
  check("loading a list adds new codes and updates descriptions", /1 SIC code added, 1 descriptions? updated/.test(loaded ?? ""), loaded);
  check("…the count follows", Boolean(await until(async () => Number((await admin.ev(`document.querySelector('[data-sic-count]')?.textContent ?? '0'`)).replace(/\D/g, "")) === before + 1)));
  check("…and the list can be downloaded", (await admin.ev(`fetch('/api/sic-codes').then((r) => r.text())`)).startsWith("SIC Code,SIC Description"));
} finally {
  sql(`delete from public.sic_codes where description like ${lit(`${TAG}%`)}`);
  browser.close();
  sql(`delete from public.lead_notes where lead_id in (select id from public.leads where project_id = ${project})`);
  sql(`delete from public.insurance_details where lead_id in (select id from public.leads where project_id = ${project})`);
  sql(`delete from public.leads where project_id = ${project}`);
  sql(`delete from public.import_batches where project_id = ${project}`);
  sql(`delete from public.activity_log where created_at > now() - interval '10 minutes' and action like 'import%'`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("imports");
