/**
 * A project's export: an administrator downloads every lead on the project
 * as a CSV in the import template's columns, with what each lead holds now
 * (coverage, call result, appointment, the notes for the client and the
 * internal ones), which the import reads back; nobody else is offered it or
 * can fetch it; and each export is in the activity log.
 *
 *   node tests/run.mjs tests/e2e/project-export.test.mjs
 */
import { APP_URL } from "../support/env.mjs";
import { check, finish, section, until } from "../support/assert.mjs";
import { sessionCookies, cookieHeader } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";
import { TEMPLATE_HEADERS, parseCsv, rowsToImport } from "../../src/lib/csv.js";

const TAG = `pexp${Date.now()}`;
const typeId = (code) => sql(`select id from public.project_types where code=${lit(code)}`);
const resultId = (type, name) => Number(sql(`select id from public.call_results where project_type=${lit(type)} and name=${lit(name)}`));
const ADMIN = Number(sql("select id from public.users where email='admin@beacon.test'"));

const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Capital Insurance`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Car Wash / AZ`)}, ${company}, ${typeId("APPT")}, 1) returning id`));
const other = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Other`)}, ${company}, ${typeId("DBDV")}, 1) returning id`));
const sic = sql("select code || '|' || description from public.sic_codes where description is not null order by code limit 1").split("|");

// The full lead: everything the template has a column for.
const full = Number(sql(`insert into public.leads (company_name, contact_name, contact_title, phone, contact_mobile, email, website, address, city, state, zip, county,
    sic_code, employees, ein, producer_name, list_source, client_note, contact2_name, call_result_dbdv, result_id, project_id)
  values (${lit(`${TAG} Parkview Car Wash, LLC`)}, 'Sean', 'Owner', '480-823-1986', '+1 714-401-2975', 'sean@parkview.example', 'parkviewwash.example', '16827 E Parkview Ave',
    'Fountain Hills', 'AZ', '85268', 'Maricopa', ${lit(sic[0])}, '14', '98-7654321', 'Jeff McDonald', 'IPA-CarWash', ${lit("Appt set with Sean.\nBring the loss runs.")}, 'Lee', 'Lead',
    ${resultId("APPT", "Appointment-Phone")}, ${project}) returning id`));
sql(`insert into public.insurance_details (lead_id, ultimate_xdate, agency_name, agency_years, pkg_xdate, pkg_carrier, wc_xdate, wc_carrier)
  values (${full}, '2027-03-01', 'Garry Insurance', 5, '2027-03-01', 'Travelers', '2027-08-17', 'CopperPoint')`);
sql(`insert into public.lead_notes (lead_id, notes) values (${full}, ${lit("-10/9/26 mike: left vm\n10/12/26 mike: set appt")})`);
// An earlier appointment marked invalid, and the one it has now.
sql(`insert into public.appointments (lead_id, project_id, appt_date, appt_time, appt_create_date, invalid_at) values (${full}, ${project}, '2026-11-02', '9:00 AM', now(), now())`);
sql(`insert into public.appointments (lead_id, project_id, appt_date, appt_time, appt_create_date) values (${full}, ${project}, '2026-11-20', '2:30 PM', now() - interval '1 day')`);
// More than one batch of plain names, and one on another project.
sql(`insert into public.leads (company_name, project_id, result_id) select ${lit(`${TAG} Filler `)} || n, ${project}, ${resultId("APPT", "Lead-No Contact")} from generate_series(1, 1004) n`);
sql(`insert into public.leads (company_name, project_id) values (${lit(`${TAG} Elsewhere Co`)}, ${other})`);

const cookies = {};
const get = async (path, as) => {
  cookies[as] ??= cookieHeader(await sessionCookies(as));
  return fetch(`${APP_URL}${path}`, { headers: { cookie: cookies[as] } });
};
const browser = await launchBrowser();
const link = (page) => page.ev("(() => { const a = document.querySelector('a[data-export-project]'); return a ? { download: a.hasAttribute('download'), href: a.getAttribute('href'), text: a.textContent.trim() } : null; })()");

try {
  section("Who is offered it");
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage();
  await admin.go(`/projects/${project}`, 5000);
  const offered = await until(() => link(admin));
  check("an administrator has “Export CSV” on the project's leads, a plain download link",
    offered?.download === true && offered.href === `/api/projects/${project}/export` && /Export CSV/.test(offered.text), JSON.stringify(offered));
  if (process.env.SHOTS) await admin.screenshot(`${process.env.SHOTS}/project-export.png`);
  admin.close();

  const manager = await (await browser.newContext({ as: "mike@beacon.test" })).newPage();
  await manager.go(`/projects/${project}`, 5000);
  check("an account manager is not", /Leads on this Project/i.test(await manager.text()) && (await link(manager)) === null);
  manager.close();

  section("Who can fetch it");
  for (const [who, email] of [["an account manager", "mike@beacon.test"], ["an agent", "agent@beacon.test"], ["a client", "client@beacon.test"]]) {
    const res = await get(`/api/projects/${project}/export`, email);
    const text = await res.text();
    check(`${who} is refused, with nothing of the project`, res.status === 403 && !text.includes(TAG), `${res.status} ${text.slice(0, 80)}`);
  }
  const anon = await fetch(`${APP_URL}/api/projects/${project}/export`, { redirect: "manual" });
  check("nobody signed out gets it", anon.status !== 200 && !(await anon.text()).includes(TAG), String(anon.status));
  check("a project that is not there is not found", (await get("/api/projects/999999999/export", "admin@beacon.test")).status === 404 && (await get("/api/projects/abc/export", "admin@beacon.test")).status === 404);

  section("The file");
  const before = Number(sql(`select count(*) from public.activity_log where action = 'leads.export' and entity_id = ${project}`));
  const res = await get(`/api/projects/${project}/export`, "admin@beacon.test");
  const csv = await res.text();
  const rows = parseCsv(csv);
  check("a CSV to save, named for the project and the day", res.status === 200 && /text\/csv/.test(res.headers.get("content-type") ?? "")
    && new RegExp(`attachment; filename="${TAG}_Car_Wash_AZ_\\d{4}-\\d{2}-\\d{2}\\.csv"`).test(res.headers.get("content-disposition") ?? ""), res.headers.get("content-disposition"));
  check("its columns are the import template's, in the template's order", JSON.stringify(rows[0].slice(0, TEMPLATE_HEADERS.length)) === JSON.stringify(TEMPLATE_HEADERS), rows[0].slice(0, 6).join(","));
  check("every lead on the project, more than one batch of them, and none of another project's",
    rows.length - 1 === 1005 && res.headers.get("x-total-count") === "1005" && !csv.includes("Elsewhere Co"), `${rows.length - 1} rows`);
  check("…in the order they are called", rows[1][0] === `${TAG} Parkview Car Wash, LLC` && rows[2][0] === `${TAG} Filler 1` && rows[1005][0] === `${TAG} Filler 1004`, `${rows[1][0]} … ${rows[1005]?.[0]}`);
  const at = (h) => rows[1][rows[0].indexOf(h)];
  check("the lead's contact and business", at("Contact") === "Sean" && at("Contact Title") === "Owner" && at("Phone") === "480-823-1986" && at("Website") === "parkviewwash.example"
    && at("Address") === "16827 E Parkview Ave" && at("Zip") === "85268" && at("County") === "Maricopa" && at("Employees") === "14" && at("EIN") === "98-7654321" && at("Contact 2") === "Lee");
  check("…its SIC code with what it means", at("SIC Code") === sic[0] && at("SIC Description") === sic[1], `${at("SIC Code")} ${at("SIC Description")}`);
  check("…its coverage", at("Ultimate XDate") === "3/1/2027" && at("Package Carrier") === "Travelers" && at("Work Comp XDate") === "8/17/2027" && at("Work Comp Carrier") === "CopperPoint"
    && at("Agency Name") === "Garry Insurance" && at("Years With Agency") === "5" && at("Auto XDate") === "");
  check("…the call result it has now, and the one it was promoted on", at("Call Result Appt") === "Appointment-Phone" && at("Call Result DBDV") === "Lead" && rows[2][rows[0].indexOf("Call Result Appt")] === "Lead-No Contact");
  check("…its current appointment, not the invalid one", at("Appointment Date") === "11/20/2026" && at("Appointment Time") === "2:30 PM");
  check("…the notes for the client and the internal ones", at("Notes") === "Appt set with Sean.\nBring the loss runs." && at("Internal Notes") === "'-10/9/26 mike: left vm\n10/12/26 mike: set appt");
  check("a value that would open as a formula is kept as text", at("Mobile Phone") === "'+1 714-401-2975");

  section("Read back by the import");
  const back = rowsToImport(rows);
  const lead = back.rows[0];
  check("every row imports", back.rows.length === 1005 && back.errors === 0, `${back.rows.length} ${back.errors}`);
  check("…the lead as it is", lead.lead.company_name === `${TAG} Parkview Car Wash, LLC` && lead.lead.contact_mobile === "+1 714-401-2975" && lead.lead.client_note === "Appt set with Sean.\nBring the loss runs."
    && lead.lead.call_result_appt === "Appointment-Phone" && lead.lead.sic_code === sic[0] && lead.lead.contact2_name === "Lee", JSON.stringify(lead.lead));
  check("…its coverage, appointment and internal notes", lead.insurance?.wc_xdate === "2027-08-17" && lead.insurance.agency_years === 5 && lead.appointment?.appt_date === "2026-11-20"
    && lead.appointment.appt_time === "2:30 PM" && lead.notes?.internal_notes === "-10/9/26 mike: left vm\n10/12/26 mike: set appt", JSON.stringify([lead.insurance, lead.appointment, lead.notes]));

  section("The record of it");
  const logged = sql(`select user_id || '|' || detail from public.activity_log where action = 'leads.export' and entity_id = ${project} order by id desc limit 1`);
  check("the export is in the activity log: who, how many, which project",
    Number(sql(`select count(*) from public.activity_log where action = 'leads.export' and entity_id = ${project}`)) === before + 1 && logged === `${ADMIN}|1,005 leads from ${TAG} Car Wash / AZ`, logged);
  check("a refused one is not", Number(sql(`select count(*) from public.activity_log where action = 'leads.export' and entity_id = ${project} and user_id <> ${ADMIN}`)) === 0);

  section("A project with no leads");
  const empty = parseCsv(await (await get(`/api/projects/${other}/export`, "admin@beacon.test")).text());
  sql(`delete from public.leads where project_id = ${other}`);
  const none = parseCsv(await (await get(`/api/projects/${other}/export`, "admin@beacon.test")).text());
  check("one lead, one row; none, the headings alone (the template)", empty.length === 2 && empty[1][0] === `${TAG} Elsewhere Co` && none.length === 1 && none[0][0] === "Company");
} finally {
  browser.close();
  sql(`delete from public.activity_log where action = 'leads.export' and entity_id in (${project}, ${other})`);
  sql(`delete from public.appointments where project_id = ${project}`);
  sql(`delete from public.leads where company_name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.projects where name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.companies where name like ${lit(`${TAG}%`)}`);
}

finish("project export");
