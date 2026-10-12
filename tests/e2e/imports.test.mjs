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
writeFileSync(file, [
  "Company,Phone,Website,Email,Call Result DBDV",
  `"${TAG} Alpha",602-555-0101,n/a,no email,Left Message`,
  `"${TAG} Beta",602-555-0102,www.betaplumbing.com,bob@beta.com,DNC`,
  `"${TAG} Gamma",602-555-0103,No Site,N/A,Callback`,
  `"${TAG} Delta",602-555-0104,see notes,dave at delta,Old Weird Result`,
].join("\n"));
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
} finally {
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
