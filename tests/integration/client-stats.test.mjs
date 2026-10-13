/**
 * The client and project figures, counted by call result (Sean, Oct 2026):
 * names, names left to call, leads active and resolved, leads developed,
 * appointments and invalid ones — for a DB dev project (which counts the
 * names it sent on), its appointment project, and the client as a whole,
 * each name once; and a project's names by call result.
 *
 * Removes everything it made.
 *
 *   node tests/integration/client-stats.test.mjs
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `CS-TEST ${Date.now()}`;
const type = (code) => sql(`select id from public.project_types where code='${code}'`);
const result = (t, name) => Number(sql(`select id from public.call_results where project_type='${t}' and name=${lit(name)}`));
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Co`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts`)}, ${company}, ${type("APPT")}, 1) returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id) values (${lit(`${TAG} DBDev`)}, ${company}, ${type("DBDV")}, 1, ${APPT}) returning id`));

// On the DB dev project still: 3 to call, 1 pending, 2 resolved.
const here = (name) => sql(`insert into public.leads (company_name, project_id, result_id) values (${lit(`${TAG} ${name}`)}, ${DBDV}, ${result("DBDV", name)})`);
for (const name of ["Viable-CallBack", "Viable-Left Message", "Viable-Staged", "Pending", "Not Interested", "Disco#"]) here(name);
// Sent on by DB dev to the appointment project, as each stands now (its DB dev result as the old system wrote it).
const sent = (dbdv, now, nowType = "APPT") =>
  sql(`insert into public.leads (company_name, project_id, source_project_id, stage, promoted_at, call_result_dbdv, result_id)
       values (${lit(`${TAG} sent ${now}`)}, ${APPT}, ${DBDV}, 'appt', now(), ${lit(dbdv)}, ${result(nowType, now)})`);
sent("X-Date-Lead", "Lead-No Contact");
sent("X-Date Hot Lead", "Lead-Left Message");
sent("Lead", "Lead-Never Shops");
sent("Appointment", "Appointment");
sent("Appointment-Phone", "Appointment-Confirmed", "DBDV");
sent("Appointment", "Appointment-Invalid");
// Loaded straight onto the appointment project by the client: leads DB dev did not develop.
const loaded = (now) => sql(`insert into public.leads (company_name, project_id, result_id) values (${lit(`${TAG} loaded ${now}`)}, ${APPT}, ${result("APPT", now)})`);
loaded("Lead-No Contact");
loaded("Lead-ClientList");
loaded("Lead-CurrentClient");
loaded("Appointment-Phone");

const admin = await signIn("admin@beacon.test");
const client = await signIn("client@beacon.test");
const row = (rows, id) => { const r = rows.find((x) => x.project_id === id); return r && [r.names, r.names_left, r.leads_active, r.leads_resolved, r.developed, r.appointments, r.invalid_appointments].map(Number).join("/"); };

try {
  section("Counted by call result");
  const { data, error } = await admin.sb.rpc("lead_stats", { p_company_id: company });
  //                              names/left/active/resolved/developed/appts/invalid
  check("a DB dev project: its names wherever they are now; left to call includes pending",
    !error && row(data, DBDV) === "12/4/2/4/6/2/1", error?.message ?? row(data ?? [], DBDV));
  check("its appointment project: the leads on it, active or resolved; developed are DB dev's only",
    row(data, APPT) === "10/0/4/6/6/3/1", row(data ?? [], APPT));
  check("the client: every name once", row(data, null) === "16/4/4/6/6/3/1", row(data ?? [], null));
  const one = await admin.sb.rpc("lead_stats", { p_project_id: APPT });
  check("one project alone: its row, and no total", !one.error && one.data.length === 1 && row(one.data, APPT) === "10/0/4/6/6/3/1", JSON.stringify(one.data));
  const theirs = await client.sb.rpc("lead_stats", { p_company_id: company });
  check("another client's user counts none of it", !theirs.error && (theirs.data ?? []).every((r) => Number(r.names) === 0), JSON.stringify(theirs.data));

  section("A project's names by call result");
  const by = async (id) => Object.fromEntries(((await admin.sb.rpc("result_breakdown", { p_project_id: id })).data ?? []).map((r) => [r.result, `${r.names} ${r.kind}`]));
  const d = await by(DBDV);
  check("DB dev: by DB dev result, the names sent on by the result that sent them (old names read as new)",
    d.Lead === "2 won" && d["Lead-Hot Lead"] === "1 won" && d.Appointment === "2 won" && d["Appointment-Phone"] === "1 won"
    && d["Viable-CallBack"] === "1 viable" && d.Pending === "1 viable" && d["Disco#"] === "1 resolved", JSON.stringify(d));
  const a = await by(APPT);
  check("appointment project: by appointment result",
    a["Lead-No Contact"] === "2 viable" && a["Lead-ClientList"] === "1 viable" && a["Lead-CurrentClient"] === "1 resolved"
    && a["Appointment-Confirmed"] === "1 won" && a["Appointment-Invalid"] === "1 resolved" && a["Appointment-Phone"] === "1 won", JSON.stringify(a));
} finally {
  sql(`delete from public.leads where company_name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.projects where id in (${DBDV}, ${APPT})`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("client stats");
