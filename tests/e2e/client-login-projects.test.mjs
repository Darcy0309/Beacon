/**
 * Which of a client's projects each of its logins sees (Sean, Nov 2026): the client (the parent account) all
 * of them; one of its agents (a producer) only the projects ticked for them on Users. What they reach follows:
 * projects, names, documents and appointment updates.
 *
 *   node tests/run.mjs tests/e2e/client-login-projects.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `CLP-TEST ${Date.now()}`;
const CLIENT = Number(sql(`select id from public.users where email = 'client@beacon.test'`));
const before = sql(`select coalesce(company_id::text, 'null') || '|' || project_scope from public.users where id = ${CLIENT}`).split("|");
// Its phone as saved locally may not pass the form's check: kept aside while the form saves it.
const phoneBefore = sql(`select coalesce(phone, '') from public.users where id = ${CLIENT}`);
const NAME = sql(`select btrim(concat_ws(' ', first_name, last_name)) from public.users where id = ${CLIENT}`);
const typeId = (c) => sql(`select id from public.project_types where code=${lit(c)}`);
const co = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Capital Ins`)}) returning id`));
const project = (name) => Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} ${name}`)}, ${co}, ${typeId("APPT")}, 1) returning id`));
const P1 = project("Churches");
const P2 = project("Trucking");
const lead = (name, pid) => Number(sql(`insert into public.leads (company_name, project_id, stage) values (${lit(`${TAG} ${name}`)}, ${pid}, 'appt') returning id`));
const L1 = lead("Gardner Electric", P1);
const L2 = lead("Desert Haulers", P2);
const D2 = Number(sql(`insert into public.documents (name, file_type, size_bytes, storage_path, lead_id, project_id, company_id)
  values (${lit(`${TAG} haulers.pdf`)}, 'PDF', 1000, ${lit(`lead/${L2}/haulers.pdf`)}, ${L2}, ${P2}, ${co}) returning id`));
sql(`update public.users set company_id = ${co}, project_scope = 'all', phone = null where id = ${CLIENT}`);
const auth = sql(`select auth_id from public.users where id = ${CLIENT}`);
const asClient = (query) => sql(`set role authenticated; select set_config('request.jwt.claims', ${lit(JSON.stringify({ sub: auth, role: "authenticated", aal: "aal2" }))}, false); ${query}`).split("\n").pop();
const sees = () => ({
  projects: asClient(`select coalesce(string_agg(id::text, ',' order by id), '') from public.projects where id in (${P1}, ${P2})`),
  leads: asClient(`select coalesce(string_agg(id::text, ',' order by id), '') from public.leads where id in (${L1}, ${L2})`),
  docs: asClient(`select count(*) from public.documents where id = ${D2}`),
});

const browser = await launchBrowser();
try {
  section("The client's own login: all of its projects");
  let now = sees();
  check("every project of the client, its names and documents", now.projects === `${P1},${P2}` && now.leads === `${L1},${L2}` && now.docs === "1", JSON.stringify(now));

  section("Set on Users: only these projects");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 1000 });
  await admin.go(`/users?q=${encodeURIComponent("client@beacon.test")}`, 5000);
  await until(() => admin.ev(`!!document.querySelector('button[aria-label="Actions for ${NAME}"]')`));
  await admin.pointer(`button[aria-label="Actions for ${NAME}"]`);
  await sleep(300);
  await admin.menuItem("Edit");
  await until(() => admin.ev(`!!document.querySelector('[data-project-scope-field]')`));
  check("a client login: a Client, all of the client's projects, to begin with",
    await admin.ev(`document.querySelector('[data-role-select]')?.value === 'client' && !document.querySelector('[data-project-scope-field]')`));
  // An Agent (Sean, Nov 2026): one of the client's agents, kept to the projects ticked.
  await admin.fill("[data-role-select]", "client_agent");
  const offered = await until(() => admin.ev(`[...document.querySelectorAll('[data-project-picks] label')].map((l) => l.textContent.trim())`).then((x) => (x?.length ? x : null)));
  check("…made an Agent: the client's projects to tick", JSON.stringify(offered) === JSON.stringify([`${TAG} Churches`, `${TAG} Trucking`]), JSON.stringify(offered));
  // None ticked: refused.
  await admin.click("[role=dialog] button[type=submit]");
  check("…none ticked: refused", Boolean(await until(() => admin.ev(`document.querySelector('[data-project-scope-field] [role=alert]')?.textContent ?? null`))));
  await admin.click(`[data-project-picks] input[value="${P1}"]`);
  await admin.click("[role=dialog] button[type=submit]");
  const saved = await until(() => {
    const v = sql(`select project_scope || '|' || coalesce((select string_agg(project_id::text, ',') from public.client_user_projects where user_id = ${CLIENT}), '') from public.users where id = ${CLIENT}`);
    return v === `only|${P1}` ? v : null;
  }, { timeout: 15000 });
  check("saved: only the project ticked", saved === `only|${P1}`, `${saved} ${await admin.toasts()} ${await admin.ev(`[...document.querySelectorAll('[role=dialog] [role=alert], [role=dialog] [aria-invalid=true]')].map((e) => e.textContent || e.name).join(' / ')`)}`);
  await admin.go(`/users?q=${encodeURIComponent("client@beacon.test")}`, 5000);
  check("…and the Users list says so", (await until(() => admin.ev(`document.querySelector('[data-project-scope="${CLIENT}"]')?.textContent ?? null`))) === "Only 1 project");

  section("An agent of the client's: only their projects");
  now = sees();
  check("only the project ticked, and its names", now.projects === String(P1) && now.leads === String(L1), JSON.stringify(now));
  check("…not another project's documents", now.docs === "0", JSON.stringify(now));
  const client = await (await browser.newContext({ as: "client@beacon.test" })).newPage({ width: 1400, height: 1000 });
  await client.go(`/project-info`, 6000);
  const info = await until(() => client.text().then((t) => (t?.includes(`${TAG} Churches`) ? t : null)), { timeout: 15000 });
  check("in the app: their project, not the other", Boolean(info?.includes(`${TAG} Churches`)) && !info.includes(`${TAG} Trucking`));
  let refused = "";
  try { asClient(`select public.mark_names(array[${L2}]::bigint[], 'deletion')`); } catch (e) { refused = String(e.stderr ?? e.message); }
  check("…and can't take another project's names off", /not on your lists/.test(refused), refused.slice(0, 160));

  section("Back to all");
  await admin.pointer(`button[aria-label="Actions for ${NAME}"]`);
  await sleep(300);
  await admin.menuItem("Edit");
  await until(() => admin.ev(`document.querySelector('[data-role-select]')?.value === 'client_agent'`));
  check("the ticked project is kept on Edit", await admin.ev(`document.querySelector('[data-project-picks] input[value="${P1}"]')?.checked === true && document.querySelector('[data-project-picks] input[value="${P2}"]')?.checked === false`));
  await admin.fill("[data-role-select]", "client");
  await admin.click("[role=dialog] button[type=submit]");
  const back = await until(() => sql(`select project_scope || '|' || (select count(*) from public.client_user_projects where user_id = ${CLIENT}) from public.users where id = ${CLIENT}`) === "all|0" || null, { timeout: 15000 });
  check("all of the client's projects again", Boolean(back) && sees().projects === `${P1},${P2}`, JSON.stringify(sees()));
} finally {
  browser.close();
  sql(`update public.users set company_id = ${before[0]}, project_scope = ${lit(before[1])}, phone = ${phoneBefore ? lit(phoneBefore) : "null"} where id = ${CLIENT}`);
  sql(`delete from public.client_user_projects where user_id = ${CLIENT}`);
  sql(`delete from public.documents where id = ${D2}`);
  sql(`delete from public.leads where id in (${L1}, ${L2})`);
  sql(`delete from public.projects where id in (${P1}, ${P2})`);
  sql(`delete from public.companies where id = ${co}`);
}

finish("client login projects");
