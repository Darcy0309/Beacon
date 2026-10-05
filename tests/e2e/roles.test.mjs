/**
 * The four demo accounts, in a real browser.
 *
 *   Part 1: the access matrix. Each role opens every page: the pages it may
 *           use render without an error screen, the rest say plainly that
 *           they are not part of its workspace, and the sidebar shows exactly
 *           the pages it may use.
 *   Part 2: the lead lifecycle across roles, on a test client:
 *           the administrator links the projects and imports a list; the
 *           account manager works it and confirms the appointment they set;
 *           the agent (as the appointment manager) works the promoted lead
 *           and passes QA; the client sees the appointment only after QA.
 *
 *   npm run test:e2e      (SHOTS=<dir> to keep a screenshot per role)
 */
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { navGroups, rolesForPath } from "../../src/lib/nav.js";

const SHOTS = process.env.SHOTS;
const ACCOUNTS = { admin: "admin@beacon.test", manager: "sean@beacon.test", agent: "agent@beacon.test", client: "client@beacon.test" };
const PAGES = navGroups.flatMap((g) => g.items);
const ERROR = /Something went wrong|Taking a moment longer|Application error|This page could not be found/i;
const DENIED = /don.t have access to this page/i;

const browser = await launchBrowser();
const pages = {};
for (const [role, email] of Object.entries(ACCOUNTS)) pages[role] = await (await browser.newContext({ as: email })).newPage();
const shot = (page, name) => (SHOTS ? page.screenshot(`${SHOTS}/${name}.png`) : null);
/** Navigate and wait until the page has finished loading (no skeleton). */
async function open(page, href) {
  await page.go(href, 300);
  await until(() => page.ev(`document.readyState === 'complete' && !document.querySelector('[aria-busy="true"]') && document.body.innerText.length > 200`), { timeout: 15000 });
  await sleep(250);
  return page.text();
}

section("Part 1: every role, every page");
for (const [role, page] of Object.entries(pages)) {
  const allowed = PAGES.filter((p) => p.roles.includes(role));
  const fails = [];
  for (const p of PAGES) {
    const text = (await open(page, p.href)) ?? "";
    // No rule for a path (the dashboard) means anyone signed in may open it.
    const may = (rolesForPath(p.href) ?? p.roles).includes(role);
    if (ERROR.test(text)) fails.push(`${p.href} shows an error`);
    else if (may && DENIED.test(text)) fails.push(`${p.href} wrongly denied`);
    else if (!may && !DENIED.test(text)) fails.push(`${p.href} should be denied`);
  }
  check(`${role}: ${allowed.length} pages open, ${PAGES.length - allowed.length} refused, none broken`, fails.length === 0, fails.join("; "));
  const sidebar = await page.ev(`[...document.querySelectorAll('aside nav a')].map((a) => a.getAttribute('href'))`);
  check(`${role}: the sidebar lists exactly those ${allowed.length} pages`, JSON.stringify([...sidebar].sort()) === JSON.stringify(allowed.map((p) => p.href).sort()), JSON.stringify(sidebar));
}

section("Part 2: the lead lifecycle across roles");
const TAG = `ROLE-TEST ${Date.now()}`;
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const SEAN = userId(ACCOUNTS.manager);
const AGENT = userId(ACCOUNTS.agent);
const CLIENT = userId(ACCOUNTS.client);
const typeId = (code) => sql(`select id from public.project_types where code=${lit(code)}`);
const clientCompany = sql(`select coalesce(company_id::text, 'null') from public.users where id=${CLIENT}`);
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appointments`)}, ${company}, ${typeId("APPT")}, 1) returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} DBDev`)}, ${company}, ${typeId("DBDV")}, 1) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${DBDV}, ${SEAN}), (${APPT}, ${AGENT})`);
sql(`update public.users set company_id=${company} where id=${CLIENT}`);
const leadId = (name) => Number(sql(`select id from public.leads where company_name=${lit(`${TAG} ${name}`)}`));
const lead = (name) => JSON.parse(sql(`select row_to_json(t) from (select l.project_id, l.stage, l.assigned_user_id as rep, r.name as result
  from public.leads l join public.call_results r on r.id = l.result_id where l.company_name=${lit(`${TAG} ${name}`)}) t`) || "null");
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const csvName = `role-test-${Date.now()}.csv`;
const pick = (page, name) => page.ev(`(() => { const b = [...document.querySelectorAll('button[aria-pressed]')].find((x) => x.textContent.trim() === ${JSON.stringify(name)}); if (!b) return false; b.click(); return true; })()`);
async function saveResult(page) {
  const before = await page.url();
  await page.click("button", "Save:");
  await until(async () => (await page.url()) !== before, { timeout: 10000 });
  await sleep(1200);
}

try {
  const { admin, manager: sean, agent, client } = pages;

  // --- Administrator: link the projects, import a list ------------------------------
  await open(admin, `/projects?q=${encodeURIComponent(TAG)}`);
  await admin.pointer(`button[aria-label="Actions for ${TAG} DBDev"]`);
  await sleep(600);
  await admin.menuItem("Edit");
  await sleep(900);
  const offered = await admin.ev(`[...document.querySelectorAll('select[name="appt_project_id"] option')].map((o) => o.textContent)`);
  check("admin: the DBDev project offers its client's Appt project to promote to", (offered ?? []).includes(`${TAG} Appointments`), JSON.stringify(offered));
  await admin.fill('select[name="appt_project_id"]', String(APPT));
  await admin.ev(`document.querySelector('select[name="appt_project_id"]').form.requestSubmit()`);
  check("admin: the link is saved", await until(() => sql(`select appt_project_id from public.projects where id=${DBDV}`) === String(APPT), { timeout: 8000 }));

  const dir = mkdtempSync(path.join(tmpdir(), "roles-"));
  const csv = path.join(dir, csvName);
  writeFileSync(csv, [
    "Company,Contact,Phone,City,State,Call Result DBDV,Call Result Appt",
    `${TAG} Ace Roofing,Ann Ace,614-555-0101,Columbus,OH,Call 0,`,
    `${TAG} Best Electric,Bo Best,614-555-0102,Columbus,OH,Call 0,`,
    `${TAG} Crest Plumbing,Cy Crest,614-555-0103,Columbus,OH,X-Date-Lead,XD-Call 0`,
  ].join("\n"));
  await open(admin, "/imports");
  await admin.fill('select[name="project_id"]', String(DBDV));
  const { root } = await admin.send("DOM.getDocument");
  const { nodeId } = await admin.send("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[type="file"]' });
  await admin.send("DOM.setFileInputFiles", { nodeId, files: [csv] });
  await sleep(500);
  await admin.click("button", "Import leads");
  const toast = await admin.waitToast(/Imported/, 15000);
  check("admin: the import asks for a project and takes the list", /Imported 3 of 3/.test(toast ?? ""), toast);
  check("admin: new names land on the DBDev project, shared to its account manager",
    lead("Ace Roofing")?.project_id === DBDV && lead("Ace Roofing")?.rep === SEAN && lead("Best Electric")?.rep === SEAN, JSON.stringify(lead("Ace Roofing")));
  check("admin: a name the old system had already made a lead starts on the Appt project, with its manager",
    lead("Crest Plumbing")?.project_id === APPT && lead("Crest Plumbing")?.stage === "appt" && lead("Crest Plumbing")?.rep === AGENT, JSON.stringify(lead("Crest Plumbing")));
  await shot(admin, "role-admin-imports");

  // --- Account manager: work the list ---------------------------------------------------
  let t = await open(sean, "/work");
  check("manager: My Projects lists the DBDev project with his 2 names", new RegExp(`${TAG} DBDev[\\s\\S]{0,200}\\b2\\b`).test(t));
  await open(sean, `/work/${DBDV}`);
  await sean.click("a", "Start calling");
  await until(async () => (await sean.path()).startsWith("/leads/"), { timeout: 10000 });
  await sleep(1500);
  const first = await sean.path();
  await pick(sean, "Viable-Left Message");
  await saveResult(sean);
  check("manager: a result saves and the next name opens", (await sean.path()) !== first && (await sean.url()).includes(`project=${DBDV}`));
  await pick(sean, "Appointment-Phone");
  // An appointment needs the name's Ultimate X-Date as well as its own date and time.
  await sean.fill('input[aria-label="Ultimate X-Date"]', "5/1/27");
  await sean.ev("document.activeElement?.blur()");
  await sean.fill('input[name="appt_date"]', tomorrow);
  await sean.fill('select[name="appt_time"]', "11:00 AM");
  await saveResult(sean);
  const appointed = sql(`select l.company_name from public.appointments a join public.leads l on l.id = a.lead_id where l.company_name like ${lit(`${TAG}%`)}`);
  check("manager: an appointment is set, waiting for QA", appointed.length > 0 && sql(`select qa_status from public.appointments a join public.leads l on l.id=a.lead_id where l.company_name like ${lit(`${TAG}%`)}`) === "pending", appointed);
  t = await open(sean, "/work");
  check("manager: it shows as an appointment to confirm", t.includes(appointed));
  await sean.click("a", appointed);
  await until(async () => (await sean.path()).startsWith("/leads/"), { timeout: 10000 });
  await sleep(1500);
  await pick(sean, "Appointment-Confirmed");
  await sean.click("button", "Save:");
  check("manager: he confirms it", await until(() => sql(`select confirmed_at is not null from public.appointments a join public.leads l on l.id=a.lead_id where l.company_name like ${lit(`${TAG}%`)}`) === "t", { timeout: 8000 }));
  t = await open(sean, `/leads/${leadId("Crest Plumbing")}`);
  check("manager: he can open another rep's lead sheet, without result buttons", !DENIED.test(t) && /Results on this name are recorded by/.test(t));
  await shot(sean, "role-manager-work");

  // --- Client: nothing before QA -----------------------------------------------------------------
  t = await open(client, "/appointments");
  check("client: the appointment is not visible before QA", !t.includes(appointed));
  check("client: and nobody has told them yet", Number(sql(`select count(*) from public.notifications where user_id=${CLIENT} and title like ${lit(`%${TAG}%`)}`)) === 0);

  // --- Agent (appointment manager and QA) --------------------------------------------------------
  t = await open(agent, "/work");
  check("agent: My Projects lists the Appt project with the promoted lead", t.includes(`${TAG} Appointments`));
  await open(agent, `/work/${APPT}`);
  await agent.click("a", "Start calling");
  await until(async () => (await agent.path()) === `/leads/${leadId("Crest Plumbing")}`, { timeout: 10000 });
  await sleep(1500);
  const apptButtons = await agent.ev(`[...document.querySelectorAll('button[aria-pressed]')].map((b) => b.textContent.trim())`);
  check("agent: Appt result buttons on the promoted lead", apptButtons.includes("Lead-Not Shopping") && apptButtons.includes("Lead-Corrected") && !apptButtons.includes("Viable-Staged"), apptButtons.join(", "));
  await pick(agent, "Lead-Not Shopping");
  await agent.click("button", "Save:");
  check("agent: records it", await until(() => lead("Crest Plumbing")?.result === "Lead-Not Shopping", { timeout: 8000 }));
  t = await open(agent, "/qa");
  check("agent: the appointment Sean set waits in the QA queue", /Appointments Waiting for QA/i.test(t) && t.includes(appointed));
  await agent.ev(`[...document.querySelectorAll('li')].find((li) => li.innerText.includes(${JSON.stringify(appointed)}))?.querySelector('button')?.click()`);
  check("agent: passes QA", await until(() => sql(`select qa_status from public.appointments a join public.leads l on l.id=a.lead_id where l.company_name like ${lit(`${TAG}%`)}`) === "passed", { timeout: 8000 }));
  await shot(agent, "role-agent-qa");

  // --- Client: after QA ---------------------------------------------------------------------------
  t = await open(client, "/appointments");
  check("client: the appointment appears once QA has passed it", t.includes(appointed));
  check("client: and they are told it is confirmed", Number(sql(`select count(*) from public.notifications where user_id=${CLIENT} and title=${lit(`Appointment confirmed: ${appointed}`)}`)) === 1);
  t = await open(client, `/leads/${leadId("Ace Roofing")}`);
  check("client: no lead sheets", DENIED.test(t));
  await shot(client, "role-client-appointments");

  // --- Administrator: the whole picture ----------------------------------------------------------
  t = await open(admin, "/work");
  check("admin: My Projects shows every project, with names left across all reps", t.includes(`${TAG} DBDev`) && t.includes(`${TAG} Appointments`) && /Left \(all reps\)/i.test(t));
  t = await open(admin, `/work/${DBDV}?rep=${SEAN}`);
  check("admin: can open Sean's list, with call counts", /\bcalls\b/i.test(await admin.ev(`document.querySelector('thead')?.innerText ?? ''`)));
  t = await open(admin, "/qa");
  check("admin: the QA queue is clear", !t.includes(appointed) || /Nothing waiting for QA/.test(t));
  await shot(admin, "role-admin-work");
} finally {
  browser.close();
  const like = lit(`${TAG}%`);
  sql(`update public.users set company_id=${clientCompany} where id=${CLIENT}`);
  sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)} or body like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.pay_events where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`update public.call_records set appointment_id = null where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.appointments where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.activity_log where entity='lead' and entity_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.leads where company_name like ${like}`);
  sql(`delete from public.import_batches where project_id in (${DBDV}, ${APPT})`);
  sql(`delete from public.activity_log where (entity='project' and entity_id in (${DBDV}, ${APPT})) or (action='leads.import' and detail like ${lit(`%from ${path.basename(csvName)}`)})`);
  sql(`delete from public.project_assignments where project_id in (${DBDV}, ${APPT})`);
  sql(`update public.projects set appt_project_id = null where id = ${DBDV}`);
  sql(`delete from public.projects where id in (${DBDV}, ${APPT})`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("role");
