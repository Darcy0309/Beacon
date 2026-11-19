/**
 * Documents keep whose they are (Sean, Nov 2026: dec sheets on a list he deleted showed no business,
 * project, agent or client). A file added to a lead keeps their names; its list deleted (hidden), or its
 * lead, project and client gone altogether, the Documents page still says whose it is; and a Project filter
 * shows every file added for that project.
 *
 *   node tests/run.mjs tests/e2e/document-names.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `DOCN-TEST ${Date.now()}`;
const typeId = (c) => sql(`select id from public.project_types where code=${lit(c)}`);
const co = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Capital Ins`)}) returning id`));
const project = (name) => Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, contact_name)
  values (${lit(`${TAG} ${name}`)}, ${co}, ${typeId("APPT")}, 1, 'Pat Frederick') returning id`));
const P1 = project("Churches");
const P2 = project("Trucking");
const lead = (name, pid) => Number(sql(`insert into public.leads (company_name, project_id, stage) values (${lit(`${TAG} ${name}`)}, ${pid}, 'appt') returning id`));
const L1 = lead("Gardner Electric", P1);
const L2 = lead("Alpine Mechanical", P1);
const L3 = lead("Desert Haulers", P2);
const doc = (leadId, name) => Number(sql(`insert into public.documents (name, file_type, size_bytes, storage_path, lead_id)
  values (${lit(`${TAG} ${name}`)}, 'PDF', 1000, ${lit(`lead/${leadId}/${name}`)}, ${leadId}) returning id`));
const D1 = doc(L1, "dec-sheet-gardner.pdf");
const D2 = doc(L2, "dec-sheet-alpine.pdf");
const D3 = doc(L3, "dec-sheet-haulers.pdf");
const kept = (id) => sql(`select concat_ws(' | ', business_name, project_name, agent_name, client_name) from public.documents where id = ${id}`);

const browser = await launchBrowser();
try {
  section("Kept as each file is added");
  check("the business, project, agent and client, with the file", kept(D1) === `${TAG} Gardner Electric | ${TAG} Churches | Pat Frederick | ${TAG} Capital Ins`, kept(D1));

  section("The list deleted; one lead, its project and client gone altogether");
  // Deleting the list hides its names (as Delete does); a hard delete clears the file's links.
  sql(`update public.leads set deleted_at = now() where id in (${L1}, ${L2})`);
  sql(`update public.documents set lead_id = null, project_id = null, company_id = null where id = ${D3}`);
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 1000 });
  await admin.go(`/documents?q=${encodeURIComponent(TAG)}`, 6000);
  const rows = await until(async () => {
    const r = await admin.ev(`[...document.querySelectorAll('tbody tr')].map((tr) => tr.innerText.replace(/\\s+/g, ' '))`);
    return r?.length >= 3 ? r : null;
  }, { timeout: 15000 });
  const row = (file) => (rows ?? []).find((r) => r.includes(file)) ?? "";
  check("its list deleted: still says the business, project, agent and client",
    [`${TAG} Gardner Electric`, `${TAG} Churches`, "Pat Frederick", `${TAG} Capital Ins`].every((t) => row("dec-sheet-gardner").includes(t)), row("dec-sheet-gardner"));
  check("…its lead, project and client gone altogether: the same", [`${TAG} Desert Haulers`, `${TAG} Trucking`, "Pat Frederick", `${TAG} Capital Ins`].every((t) => row("dec-sheet-haulers").includes(t)), row("dec-sheet-haulers"));

  section("Filtered by project");
  check("a Project filter", await admin.ev(`!!document.querySelector('select[aria-label="Filter by Project"]')`));
  await admin.fill('select[aria-label="Filter by Project"]', `${TAG} Churches`);
  const churches = await until(async () => {
    const r = await admin.ev(`[...document.querySelectorAll('tbody tr')].map((tr) => tr.innerText)`);
    return (await admin.url()).includes("project=") && r.length && r.every((t) => !t.includes("dec-sheet-haulers")) ? r : null;
  }, { timeout: 15000 });
  check("…every file added for that project, its list deleted or not, and no other project's",
    (churches ?? []).some((t) => t.includes("dec-sheet-gardner")) && churches.some((t) => t.includes("dec-sheet-alpine")) && churches.every((t) => !t.includes("dec-sheet-haulers")), JSON.stringify(churches));
  await sleep(100);
} finally {
  browser.close();
  sql(`delete from public.documents where id in (${D1}, ${D2}, ${D3})`);
  sql(`delete from public.leads where id in (${L1}, ${L2}, ${L3})`);
  sql(`delete from public.projects where id in (${P1}, ${P2})`);
  sql(`delete from public.companies where id = ${co}`);
}

finish("document names");
