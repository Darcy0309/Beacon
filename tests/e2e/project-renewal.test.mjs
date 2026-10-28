/**
 * Renewing a lead project (Oct 2026): ProjectA's program ends and its
 * renewal, ProjectB, carries on from it on the same appointment project
 * (the parent of the client's lead projects): the same settings, a new goal,
 * the managers chosen, and the viable names chosen (here, those matching the
 * list's filter), each keeping its call result. ProjectA keeps its history,
 * the names carried show there as Moved, it is completed, and the client's
 * totals count each name once. Managers are told of the project put in
 * their hands, with its names, and of ProjectA completed. A new list for
 * ProjectB leaves out businesses already on it or its appointment project.
 *
 * Removes everything it made.
 *
 *   node tests/e2e/project-renewal.test.mjs
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `RENEW-E2E ${Date.now()}`;
const manager = Number(sql(`select id from public.users where role = 'manager' and status = 'active' and deleted_at is null order by id limit 1`));
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const type = (code) => `(select id from public.project_types where code = '${code}')`;
const parent = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts`)}, ${company}, ${type("APPT")}, 1) returning id`));
const projectA = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id, lead_rate)
  values (${lit(`${TAG} A`)}, ${company}, ${type("DBDV")}, 1, ${parent}, 12.5) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${projectA}, ${manager})`);
const lead = (project, name, phone, state, result) => Number(sql(`insert into public.leads (project_id, company_name, phone, state, zip, result_id)
  values (${project}, ${lit(`${TAG} ${name}`)}, ${lit(phone)}, ${lit(state)}, '54911', public.call_result_from_text(${lit(project === parent ? "APPT" : "DBDV")}, ${lit(result)})) returning id`));
const callBack = lead(projectA, "CallBack WI", "920-555-2001", "WI", "Viable-CallBack");
const message = lead(projectA, "Message WI", "920-555-2002", "WI", "Viable-Left Message");
const pendingMn = lead(projectA, "Pending MN", "920-555-2003", "MN", "Pending");
const notInterested = lead(projectA, "Not Interested", "920-555-2004", "WI", "Not Interested");
sql(`update public.leads set source_project_id = ${projectA} where id = ${lead(parent, "A Lead", "920-555-2005", "WI", "Lead-No Contact")}`);
const result = (id) => sql(`select r.name from public.leads l join public.call_results r on r.id = l.result_id where l.id = ${id}`);
const namesA = () => sql(`select names from public.lead_stats(null, ${projectA})`);
const clientNames = () => sql(`select names from public.lead_stats(${company}, null) where project_id is null`);
const namesBefore = namesA();
const clientBefore = clientNames();
let projectB = null;

const file = path.join(mkdtempSync(path.join(tmpdir(), "renew-")), "new-list.csv");
writeFileSync(file, ["Company,Phone,State,ZIP",
  `"${TAG} CallBack WI again",(920) 555-2001,WI,54911`, // carried over to ProjectB: same phone
  `"${TAG} A Lead",920.555.2005,WI,54911`, // already a lead on the appointment project
  `"${TAG} Brand New",920-555-2099,WI,54911`].join("\n"));

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1400, height: 1000 });

  section("Renew, carrying the names matching the list's filter");
  await admin.go(`/projects/${projectA}?state=WI`, 6000);
  await admin.click("[data-renew-open]");
  const counts = await until(() => admin.ev(`(() => { const a = document.querySelector('[data-renew-all]')?.textContent;
    const m = document.querySelector('[data-renew-matching]')?.textContent; return a && m ? a + '|' + m : null; })()`), { timeout: 10000 });
  check("the viable names: three in all, two in Wisconsin (not the one Not Interested)", counts === "3|2", counts);
  check("ProjectA's managers are ticked to start with", await admin.ev(`document.querySelector('[data-renew-manager="${manager}"]')?.checked === true`));
  await admin.fill("[data-renew-name]", `${TAG} B`);
  await admin.fill("[data-renew-goal]", "50");
  await admin.click('[data-renew-names="matching"]');
  await admin.click("[data-renew-go]");
  const said = await admin.waitToast(/is set up/, 20000);
  check("it says so", /2 viable names carried over and shared across 1 manager; .* A is completed/.test(said ?? ""), said);
  projectB = Number(await until(() => sql(`select coalesce(max(id), 0) from public.projects where renewed_from_id = ${projectA}`) || null) || 0) || null;
  check("ProjectB is made", Boolean(projectB));
  check("…on the same appointment project, with ProjectA's rates, the new goal, and active",
    sql(`select appt_project_id || '|' || lead_rate || '|' || lead_goal || '|' || (select name from public.project_statuses s where s.id = status_id) from public.projects where id = ${projectB}`)
      === `${parent}|12.50|50|Active`);
  check("…with the manager on it", sql(`select count(*) from public.project_assignments where project_id = ${projectB} and ae_user_id = ${manager}`) === "1");
  const carried = sql(`select string_agg(replace(l.company_name, ${lit(`${TAG} `)}, '') || ':' || r.name || ':' || (l.assigned_user_id = ${manager}), ',' order by l.company_name)
    from public.leads l join public.call_results r on r.id = l.result_id where l.project_id = ${projectB}`);
  check("the Wisconsin names carried, each with its own call result, shared to the manager",
    carried === "CallBack WI:Viable-CallBack:true,Message WI:Viable-Left Message:true", carried);
  check("the page opens on ProjectB", Boolean(await until(async () => (await admin.ev("location.pathname")) === `/projects/${projectB}`, { timeout: 10000 })));

  section("ProjectA's history");
  check("the names carried are Moved there", result(callBack) === "Moved" && result(message) === "Moved", `${result(callBack)} / ${result(message)}`);
  check("…with a note saying where", /Moved to .*B \(renewal\)/.test(sql(`select notes from public.lead_notes where lead_id = ${callBack}`)));
  check("…and are not on the client's removal list", sql(`select count(*) from public.client_removals where lead_id in (${callBack}, ${message})`) === "0");
  check("the names not carried stay as they were", result(pendingMn) === "Pending" && result(notInterested) === "Not Interested");
  check("ProjectA is completed", sql(`select s.name from public.projects p join public.project_statuses s on s.id = p.status_id where p.id = ${projectA}`) === "Completed");
  check("ProjectA's stats are as they were", namesA() === namesBefore, `${namesBefore} → ${namesA()}`);
  check("the client's totals count each name once", clientNames() === clientBefore, `${clientBefore} → ${clientNames()}`);
  await admin.go(`/projects/${projectA}`, 5000);
  check("ProjectA links to its renewal", /Renewed as .*B/.test(await admin.ev(`document.querySelector('[data-renewal-links]')?.textContent ?? ''`)));

  section("Managers told");
  const notices = sql(`select string_agg(title || ' — ' || coalesce(body, ''), ' / ' order by id) from public.notifications
    where user_id = ${manager} and title like ${lit(`%${TAG}%`)}`);
  check("the project put in their hands, with how many names", new RegExp(`Project assigned to you: ${TAG} Insurance · ${TAG} B — 2 names to call`).test(notices), notices);
  check("ProjectA completed", new RegExp(`Project completed: ${TAG} Insurance · ${TAG} A`).test(notices), notices);
  check("names shared out say which project", sql(`select count(*) from public.notifications where user_id = ${manager} and title = '2 leads assigned to you'
    and body like ${lit(`On ${TAG} Insurance · ${TAG} B%`)}`) === "1");

  section("A new list for ProjectB");
  await admin.go("/imports", 4000);
  await admin.fill('select[name="project_id"]', String(projectB));
  const { root } = await admin.send("DOM.getDocument");
  const { nodeId } = await admin.send("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[name="file"]' });
  await admin.send("DOM.setFileInputFiles", { nodeId, files: [file] });
  const summary = await until(async () => admin.ev(`document.querySelector('[data-import-summary]')?.textContent ?? ''`), { timeout: 15000 });
  check("businesses carried over or already leads on the appointment project are left out", /1 of 3 rows will be imported/.test(summary ?? "")
    && (await admin.ev(`document.querySelector('[data-existing-count]')?.textContent`)) === "2", summary);
  await admin.click("button[type=submit]", "Import leads");
  const imported = await admin.waitToast(/Imported 1 of 3/, 20000);
  check("…and the import keeps the records there", /2 already on the project/.test(imported ?? "")
    && sql(`select count(*) from public.leads where project_id = ${projectB}`) === "3", imported);
} finally {
  browser.close();
  const projects = [projectA, parent, projectB].filter(Boolean).join(",");
  sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)} or body like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.client_removals where company_id = ${company}`);
  sql(`delete from public.lead_notes where lead_id in (select id from public.leads where project_id in (${projects}))`);
  sql(`delete from public.leads where project_id in (${projects})`);
  sql(`delete from public.import_batches where project_id in (${projects})`);
  sql(`delete from public.project_assignments where project_id in (${projects})`);
  sql(`delete from public.project_profiles where project_id in (${projects})`);
  sql(`delete from public.projects where id in (${[projectB, projectA, parent].filter(Boolean).join(",")})`);
  sql(`delete from public.companies where id = ${company}`);
  sql(`delete from public.activity_log where created_at > now() - interval '10 minutes' and action in ('project.renew', 'leads.import')`);
}

finish("project renewal");
