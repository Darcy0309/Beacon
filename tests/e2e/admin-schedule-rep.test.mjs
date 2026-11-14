/**
 * An administrator's Today's Schedule, as a client's Sales Rep (Sean, Nov 2026: "Mike's Today's Schedule
 * should only show his clients data and same with mine under our admin users"): an administrator who is a
 * client's Sales Rep sees their own clients' appointments, and those of clients with no Sales Rep yet, not
 * another Sales Rep's; one who is nobody's Sales Rep sees every one, as before. Removes what it made.
 *
 *   node tests/run.mjs tests/e2e/admin-schedule-rep.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `ASR ${Date.now()}`;
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const ADMIN = userId("admin@beacon.test");
const SEAN = userId("sean@beacon.test");
const APPT_TYPE = sql("select id from public.project_types where code='APPT'");
const today = sql("select (now() at time zone public.business_tz())::date::text");

// A client (its Sales Rep, or none), a project, a lead and an appointment today.
const made = [];
const client = (name, rep) => {
  const company = Number(sql(`insert into public.companies (name, sales_rep_id) values (${lit(`${TAG} ${name}`)}, ${rep ?? "null"}) returning id`));
  const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} ${name} Appts`)}, ${company}, ${APPT_TYPE}, 1) returning id`));
  const lead = Number(sql(`insert into public.leads (company_name, contact_name, project_id, assigned_user_id, stage) values (${lit(`${TAG} ${name} Prospect`)}, 'Dana', ${project}, ${SEAN}, 'appt') returning id`));
  const appt = Number(sql(`insert into public.appointments (lead_id, user_id, project_id, appt_date, appt_time, duration_min, qa_status)
    values (${lead}, ${SEAN}, ${project}, ${lit(today)}, '10:00 AM', 30, 'passed') returning id`));
  made.push({ company, project, lead, appt });
  return `a${appt}`;
};

const browser = await launchBrowser();
try {
  const mine = client("Admin's Client", ADMIN);
  const seans = client("Sean's Client", SEAN);
  const nobodys = client("Unassigned Client", null);

  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 1100 });
  const items = async () => {
    await admin.go("/", 6000);
    return until(() => admin.ev(`(() => { const s = document.querySelector('[data-my-schedule]'); return s ? [...s.querySelectorAll('[data-schedule-item]')].map((i) => i.dataset.scheduleItem) : null; })()`), { timeout: 15000 });
  };

  section("An administrator who is a client's Sales Rep");
  const asRep = (await items()) ?? [];
  check("their own client's appointment today", asRep.includes(mine), JSON.stringify(asRep));
  check("…and a client's with no Sales Rep yet", asRep.includes(nobodys), JSON.stringify(asRep));
  check("…not another Sales Rep's client's", !asRep.includes(seans), JSON.stringify(asRep));

  section("An administrator who is nobody's Sales Rep");
  sql(`update public.companies set sales_rep_id = null where id = ${made[0].company}`);
  const asAdmin = (await items()) ?? [];
  check("every client's, as before", [mine, seans, nobodys].every((k) => asAdmin.includes(k)), JSON.stringify(asAdmin));
} finally {
  browser.close();
  for (const m of made) {
    sql(`delete from public.appointments where id = ${m.appt}`);
    sql(`delete from public.leads where id = ${m.lead}`);
    sql(`delete from public.projects where id = ${m.project}`);
    sql(`delete from public.companies where id = ${m.company}`);
  }
}

finish("admin schedule by Sales Rep");
