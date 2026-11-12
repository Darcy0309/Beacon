/**
 * A project's manager, changed from the Projects list (client, Nov 2026): the Manager column opens a
 * menu of the account managers; picking another asks "are you sure?" naming the project and the
 * person; confirming puts them on it in place of the manager there, the agents staying, its names still
 * to call shared out again. Cancel changes nothing. A client sees no such menu.
 *
 * Works on its own project and removes everything it made.
 *
 *   npm run test:e2e
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `PM-E2E ${Date.now()}`;
const id = (email) => Number(sql(`select id from public.users where email = ${lit(email)}`));
const SEAN = id("sean@beacon.test");
const MIKE = id("mike@beacon.test");
const AGENT = id("agent@beacon.test");
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} DBDev`)}, ${company}, (select id from public.project_types where code='DBDV'), 1) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${project}, ${SEAN}), (${project}, ${AGENT})`);
// Names still to call, held by Sean: shared out again when he comes off.
for (let i = 0; i < 4; i += 1) {
  sql(`insert into public.leads (company_name, project_id, assigned_user_id) values (${lit(`${TAG} Name ${i}`)}, ${project}, ${SEAN})`);
}
const team = () => sql(`select string_agg(ae_user_id::text, ',' order by ae_user_id) from public.project_assignments where project_id = ${project}`);
const holders = () => sql(`select string_agg(distinct assigned_user_id::text, ',') from public.leads where project_id = ${project}`);

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 900 });
  const cell = `[data-project-manager="${project}"]`;
  const open = async () => {
    await admin.go(`/projects?q=${encodeURIComponent(TAG)}`, 5000);
    await until(() => admin.ev(`!!document.querySelector('${cell}')`));
    await admin.pointer(cell);
    return until(() => admin.ev(`!!document.querySelector('[data-project-manager-menu]')`));
  };

  section("The Manager column");
  check("shows the project's manager, not the agent on it", (await until(async () => {
    await admin.go(`/projects?q=${encodeURIComponent(TAG)}`, 5000);
    return admin.ev(`document.querySelector('${cell}')?.innerText.trim() ?? null`);
  })) === "Sean F.");
  check("a click opens the account managers to choose from", Boolean(await open()));
  const choices = await admin.ev(`[...document.querySelectorAll('[data-manager-choice]')].map((e) => e.innerText.trim())`);
  check("…managers and administrators, no agents", choices.some((c) => c.startsWith("Mike Preston")) && choices.some((c) => c.startsWith("Darcy Johnston"))
    && !choices.some((c) => c.startsWith("Tyler")), JSON.stringify(choices));
  check("…the one managing it now ticked, and not chosen again",
    await admin.ev(`(() => { const s = document.querySelector('[data-manager-choice="${SEAN}"]'); return !!s?.querySelector('svg') && s.getAttribute('aria-disabled') === 'true'; })()`));

  section("Asked first");
  await admin.ev(`document.querySelector('[data-manager-choice="${MIKE}"]').click()`);
  const asked = await until(() => admin.ev(`document.querySelector('[data-confirm-dialog]')?.innerText ?? null`));
  check("are you sure, naming the project and the new manager, and who comes off",
    /Are you sure you want to change .*PM-E2E .* DBDev.*manager to Mike Preston\?/s.test(asked ?? "") && /Sean F\. will come off it/.test(asked ?? ""), asked);
  await admin.click("[data-confirm-cancel]", "Cancel");
  await sleep(600);
  check("Cancel: nothing changes", team() === [SEAN, AGENT].sort((a, b) => a - b).join(","), team());

  section("Changed");
  await open();
  await admin.ev(`document.querySelector('[data-manager-choice="${MIKE}"]').click()`);
  await until(() => admin.ev(`!!document.querySelector('[data-confirm]')`));
  await admin.click("[data-confirm]", "Change manager");
  check("Mike manages it now; Sean is off it, the agent still on it",
    Boolean(await until(() => team() === [MIKE, AGENT].sort((a, b) => a - b).join(","), { timeout: 8000 })), team());
  check("…its names no longer held by Sean", Boolean(await until(() => !(holders() ?? "").split(",").includes(String(SEAN)))), holders());
  check("…it says so", /Mike Preston manages .* now/.test((await admin.waitToast(/manages/)) ?? ""));
  check("…and the column shows him", Boolean(await until(() => admin.ev(`document.querySelector('${cell}')?.innerText.trim() === 'Mike P.'`))));
  check("…written in the activity log", Number(sql(`select count(*) from public.activity_log where action = 'project.manager' and entity_id = ${project}`)) === 1);

  section("Not for a client");
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1500, height: 900 });
  await client.go("/projects", 5000);
  check("a client's Projects list has no manager menu", !(await client.ev("!!document.querySelector('[data-project-manager]')")));
} finally {
  browser.close();
  sql(`delete from public.activity_log where entity = 'project' and entity_id = ${project}`);
  sql(`delete from public.leads where project_id = ${project}`);
  sql(`delete from public.project_assignments where project_id = ${project}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("project manager");
