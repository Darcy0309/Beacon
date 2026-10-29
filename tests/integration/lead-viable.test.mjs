/**
 * Lead-Viable (Sean, Oct 2026): a lead starts at Lead-No Contact; called by
 * a manager and not made an appointment or resolved, it is Lead-Viable (the
 * call kept as what happened on it), still on the call list. Results that
 * say something of their own stay as titled; a result set without a call is
 * left as it is; Lead-Viable is not a button; DB dev's results are untouched.
 *
 * Removes everything it made.
 *
 *   node tests/integration/lead-viable.test.mjs
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `LV-TEST ${Date.now()}`;
const MIKE = Number(sql(`select id from public.users where email = 'mike@beacon.test'`));
const SEAN = Number(sql(`select id from public.users where email = 'sean@beacon.test'`));
const result = (type, name) => Number(sql(`select id from public.call_results where project_type = '${type}' and name = ${lit(name)}`));
const type = (code) => sql(`select id from public.project_types where code = '${code}'`);
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Co`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts`)}, ${company}, ${type("APPT")}, 1) returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id) values (${lit(`${TAG} DBDev`)}, ${company}, ${type("DBDV")}, 1, ${APPT}) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${APPT}, ${MIKE}), (${DBDV}, ${SEAN})`);
let n = 0;
const newName = (project = APPT, stage = "appt", start = result("APPT", "Lead-No Contact"), rep = MIKE) => {
  n += 1;
  return Number(sql(`insert into public.leads (company_name, project_id, stage, assigned_user_id, result_id)
    values (${lit(`${TAG} ${n}`)}, ${project}, '${stage}', ${rep}, ${start}) returning id`));
};
const now = (id) => sql(`select r.name || '|' || coalesce(l.call_result_appt, '') from public.leads l join public.call_results r on r.id = l.result_id where l.id = ${id}`);
const lastCall = (id) => sql(`select coalesce((select call_result from public.call_records where lead_id = ${id} order by id desc limit 1), '')`);

const mike = await signIn("mike@beacon.test");
const sean = await signIn("sean@beacon.test");
const record = (who, id, t, name) => who.sb.rpc("record_call_result", {
  p_lead_id: id, p_result_id: result(t, name), p_notes: null, p_appointment: null, p_corrected_xdate: null,
  p_ultimate_xdate: name === "Lead" ? "2027-03-01" : null,
});
const onList = async (id) => ((await mike.sb.rpc("call_list", { p_project_id: APPT, p_limit: 500 })).data ?? []).some((r) => r.id === id);

try {
  section("Called, still to work: Lead-Viable");
  for (const name of ["Lead-No Contact", "Lead-Left Message", "Lead-Email"]) {
    const id = newName();
    const { error } = await record(mike, id, "APPT", name);
    check(`${name}: the lead Lead-Viable, the call kept as ${name}`, !error && now(id) === "Lead-Viable|Lead-Viable" && lastCall(id) === name, error?.message ?? `${now(id)} / ${lastCall(id)}`);
    check("…still on the call list", await onList(id));
  }
  {
    const id = newName();
    await record(mike, id, "APPT", "Lead-Left Message");
    const { error } = await record(mike, id, "APPT", "Lead-Email");
    check("called again: still Lead-Viable, two calls", !error && now(id).startsWith("Lead-Viable|") && sql(`select count(*) from public.call_records where lead_id = ${id}`) === "2");
  }

  section("What stays as titled");
  for (const name of ["Lead-ClientList", "Lead-Not Shopping", "Lead-Never Shops"]) {
    const id = newName();
    const { error } = await record(mike, id, "APPT", name);
    check(`${name}: as titled`, !error && now(id).startsWith(`${name}|`), error?.message ?? now(id));
  }
  {
    const id = newName(APPT, "appt", result("APPT", "Lead-Left Message"));
    sql(`update public.leads set result_id = ${result("APPT", "Lead-No Contact")} where id = ${id}`);
    check("a result set without a call (Result Change): as set", now(id).startsWith("Lead-No Contact|"), now(id));
  }
  {
    const id = newName();
    const { error } = await record(mike, id, "APPT", "Lead-Viable");
    check("Lead-Viable is given by a call, not picked", /recorded automatically/i.test(error?.message ?? ""), error?.message);
  }

  section("DB dev");
  {
    const id = newName(DBDV, "dbdev", result("DBDV", "Viable-CallBack"), SEAN);
    const { error } = await record(sean, id, "DBDV", "Viable-Left Message");
    check("its results untouched", !error && now(id).startsWith("Viable-Left Message|"), error?.message ?? now(id));
    sql(`insert into public.insurance_details (lead_id, ultimate_xdate) values (${id}, '2027-03-01')`);
    const { error: pErr } = await record(sean, id, "DBDV", "Lead");
    check("promoted: Lead-No Contact on the appointment project, not called there yet", !pErr && now(id).startsWith("Lead-No Contact|"), pErr?.message ?? now(id));
  }
} finally {
  sql(`delete from public.leads where company_name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.projects where id in (${DBDV}, ${APPT})`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("lead viable");
