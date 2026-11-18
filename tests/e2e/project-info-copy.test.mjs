/**
 * "Copy from…" on a project's Project Info (Sean, Nov 2026: Capital Insurance's 15 projects, Rural's
 * 35, every one on the same sheet), end to end: an administrator picks another project (the same
 * client's listed first, a search for the rest, never the project itself nor an empty sheet) and its
 * Project Info is copied on, all but the contacts: the agent's mobile and email, the producers and the
 * office stay the project's own. It shows at once, and the copy is in the activity log.
 *
 *   node tests/run.mjs tests/e2e/project-info-copy.test.mjs
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const SHOTS = process.env.SHOTS;
const RUN = Date.now();
const TAG = `PIC-TEST ${RUN}`;
const typeId = (code) => sql(`select id from public.project_types where code=${lit(code)}`);
const ADMIN = Number(sql(`select id from public.users where email='admin@beacon.test'`));
const company = (name) => Number(sql(`insert into public.companies (name) values (${lit(`${TAG} ${name}`)}) returning id`));
const CAPITAL = company("Capital Insurance");
const OTHER = company("Aardvark Agency"); // sorts first by name: the same client still comes first
const project = (name, co, office = {}) => Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, contact_name, phone, address, city, state, zip)
  values (${lit(`${TAG} ${name}`)}, ${co}, ${typeId("APPT")}, 1, ${lit(office.contact ?? null)}, ${lit(office.phone ?? null)}, ${lit(office.address ?? null)}, ${lit(office.city ?? null)}, ${lit(office.state ?? null)}, ${lit(office.zip ?? null)}) returning id`));

const FROM = project("Capital TX", CAPITAL, { contact: "Dana Cole", phone: "(512) 555-0100", address: "1 Congress Ave", city: "Austin", state: "TX", zip: "78701" });
const TO = project("Capital OK", CAPITAL, { contact: "Ray Mills", phone: "(405) 555-0100", address: "9 Main St", city: "Tulsa", state: "OK", zip: "74103" });
const ELSEWHERE = project("Aardvark WI", OTHER);
const EMPTY_ONE = project("Capital Empty", CAPITAL);
const sheet = `states_licensed, top_carriers, avoid_carriers, avoid_days, special_programs, personal_lines, min_employees, quote_time,
  quote_min_time, wc_mono, wc_min_employees, auto_mono, auto_min_autos, health_only, health_min_lives, value_added, exclusive_program, industry_notes`;
sql(`insert into public.project_profiles (project_id, agent_mobile, agent_email, producers, states_licensed, top_carriers, avoid_carriers, avoid_days,
    special_programs, personal_lines, min_employees, quote_time, wc_mono, wc_min_employees, value_added, industry_notes)
  values (${FROM}, '(512) 555-0111', 'dana@capital.test', '[{"first":"Dana","last":"Cole","email":"dana@capital.test","leads":true}]'::jsonb,
    '{OK,TX}', '{Travelers,Hartford}', '{Progressive}', '{1,5}', 'Trucking program', true, 5, '2-3 months', true, 3, 'Free risk review', 'No restaurants')`);
// The project copied onto: its own contacts, and an old sheet the copy replaces (blank where the source is blank).
sql(`insert into public.project_profiles (project_id, agent_mobile, agent_email, producers, states_licensed, exclusive_program, health_only)
  values (${TO}, '(405) 555-0222', 'ray@capital.test', '[{"first":"Ray","last":"Mills","email":"ray@capital.test","leads":true}]'::jsonb, '{KS}', 'Old exclusive', true)`);
sql(`insert into public.project_profiles (project_id, states_licensed) values (${ELSEWHERE}, '{WI}')`);
const row = (id) => JSON.parse(sql(`select row_to_json(t)::text from (select agent_mobile, agent_email, producers, ${sheet} from public.project_profiles where project_id = ${id}) t`));
const office = (id) => JSON.parse(sql(`select row_to_json(t)::text from (select contact_name, phone, address, city, state, zip from public.projects where id = ${id}) t`));
const before = { office: office(TO), row: row(TO) };

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await admin.go(`/projects/${TO}`, 8000);

  section("Copy from…: the projects to copy from");
  check("the button on Project Info", Boolean(await until(() => admin.ev(`!!document.querySelector('[data-copy-project-info]')`), { timeout: 15000 })));
  await admin.ev(`document.querySelector('[data-copy-project-info]').click()`);
  const listed = await until(async () => {
    const ids = await admin.ev(`[...document.querySelectorAll('[data-copy-info-source]')].map((b) => Number(b.dataset.copyInfoSource))`);
    return ids?.includes(FROM) ? ids : null;
  }, { timeout: 15000 });
  check("the same client's first, marked so", listed?.indexOf(FROM) < listed?.indexOf(ELSEWHERE)
    && /Same client/.test(await admin.ev(`document.querySelector('[data-copy-info-source="${FROM}"]').innerText`)), JSON.stringify(listed?.slice(0, 5)));
  check("…with its states and carriers", /OK, TX · 2 carriers/.test(await admin.ev(`document.querySelector('[data-copy-info-source="${FROM}"]').innerText`)));
  check("never this project, nor one with nothing on its sheet", !listed.includes(TO) && !listed.includes(EMPTY_ONE));
  await admin.fill("[data-copy-info-search]", `${TAG} aardvark`);
  await sleep(300);
  const found = await admin.ev(`[...document.querySelectorAll('[data-copy-info-source]')].map((b) => Number(b.dataset.copyInfoSource))`);
  check("the search finds by client", JSON.stringify(found) === JSON.stringify([ELSEWHERE]), JSON.stringify(found));
  await admin.fill("[data-copy-info-search]", `${TAG} capital tx`);
  await sleep(300);
  check("Copy waits for a pick", await admin.ev(`document.querySelector('[data-copy-info-confirm]').disabled`));
  await admin.ev(`document.querySelector('[data-copy-info-source="${FROM}"]').click()`);
  if (SHOTS) await admin.screenshot(`${SHOTS}/project-info-copy.png`);
  await admin.ev(`document.querySelector('[data-copy-info-confirm]').click()`);

  section("Copied: all but the contacts");
  const after = await until(() => { const r = row(TO); return r.top_carriers?.length ? r : null; }, { timeout: 15000 });
  const src = row(FROM);
  const same = sheet.split(",").map((k) => k.trim()).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(src[k]));
  check("the sheet now the same as Capital TX's", same.length === 0, `differs: ${same.join(", ")}`);
  check("…blank where that one's blank (the old exclusive program gone)", after.exclusive_program === null && after.health_only === null);
  check("the agent's mobile and email kept", after.agent_mobile === before.row.agent_mobile && after.agent_email === before.row.agent_email, JSON.stringify(after));
  check("…the producers kept", JSON.stringify(after.producers) === JSON.stringify(before.row.producers), JSON.stringify(after.producers));
  check("…and the office", JSON.stringify(office(TO)) === JSON.stringify(before.office), JSON.stringify(office(TO)));
  check("Capital TX's own untouched", row(FROM).agent_email === "dana@capital.test");
  const page = await until(() => admin.ev(`(() => { const t = document.querySelector('[data-project-info-card]')?.innerText ?? ''; return /Travelers/.test(t) ? t : null; })()`), { timeout: 15000 });
  check("shown on the page at once", Boolean(page) && /No restaurants/.test(page) && !(await admin.ev(`!!document.querySelector('[data-copy-info-dialog]')`)));
  check("in the activity log", sql(`select count(*) from public.activity_log where action = 'project.info_copied' and entity_id = ${TO} and user_id = ${ADMIN}`) === "1");
} finally {
  browser.close();
  const ids = [FROM, TO, ELSEWHERE, EMPTY_ONE].join(",");
  sql(`delete from public.activity_log where entity = 'project' and entity_id in (${ids})`);
  sql(`delete from public.project_profiles where project_id in (${ids})`);
  sql(`delete from public.projects where id in (${ids})`);
  sql(`delete from public.companies where id in (${CAPITAL}, ${OTHER})`);
}

finish("project info copy");
