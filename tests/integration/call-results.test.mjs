/**
 * The call result buttons as the client asked in October, against the
 * database as real signed-in users: "Viable-No Contact" is "Viable-CallBack"
 * (and the old name still finds it); "Lead-Hot Lead" promotes a name like
 * Lead, marked hot, alerting the appointment manager; and a name becomes a
 * Lead or an Appointment only with its Ultimate X-Date, an appointment only
 * with its date and time.
 *
 * Runs on its own test client and removes everything it made.
 *
 *   npm run test:integration
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `CR-TEST ${Date.now()}`;
const one = (query) => JSON.parse(sql(`select coalesce(row_to_json(t), 'null') from (${query}) t`));
const all = (query) => JSON.parse(sql(`select coalesce(json_agg(t), '[]') from (${query}) t`));
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const SEAN = userId("sean@beacon.test");
const MIKE = userId("mike@beacon.test");
const RESULT = Object.fromEntries(all("select id, project_type, name from public.call_results").map((r) => [`${r.project_type}:${r.name}`, r.id]));

const companyId = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const typeId = (code) => sql(`select id from public.project_types where code=${lit(code)}`);
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, lead_rate, appointment_rate, confirmation_rate)
  values (${lit(`${TAG} Appointments`)}, ${companyId}, ${typeId("APPT")}, 1, 0, 40, 10) returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id, lead_rate, appointment_rate, confirmation_rate)
  values (${lit(`${TAG} DBDev`)}, ${companyId}, ${typeId("DBDV")}, 1, ${APPT}, 10, 30, 5) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${DBDV}, ${SEAN}), (${APPT}, ${MIKE})`);

let n = 0;
/** A fresh name on the DBDev project, held by Sean; `ins` adds policy dates. */
function newName(ins = null) {
  n += 1;
  const id = Number(sql(`insert into public.leads (company_name, project_id, assigned_user_id) values (${lit(`${TAG} Co ${n}`)}, ${DBDV}, ${SEAN}) returning id`));
  if (ins) sql(`insert into public.insurance_details (lead_id, ${Object.keys(ins).join(", ")}) values (${id}, ${Object.values(ins).map(lit).join(", ")})`);
  return id;
}
const lead = (id) => one(`select l.stage, l.project_id, r.name as result, s.code as status, l.assigned_user_id as rep, l.call_weight as weight,
  (select ultimate_xdate from public.insurance_details i where i.lead_id = l.id limit 1)::text as ultimate
  from public.leads l join public.call_results r on r.id = l.result_id left join public.lead_statuses s on s.id = l.status_id where l.id = ${id}`);

const sean = await signIn("sean@beacon.test");
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const record = (leadId, name, extra = {}) => sean.sb.rpc("record_call_result", {
  p_lead_id: leadId, p_result_id: RESULT[`DBDV:${name}`], p_notes: null,
  p_appointment: extra.appointment ?? null, p_corrected_xdate: null, p_ultimate_xdate: extra.ultimate ?? null,
});

try {
  section("Viable-CallBack");
  {
    check("the button is Viable-CallBack", Boolean(RESULT["DBDV:Viable-CallBack"]) && !RESULT["DBDV:Viable-No Contact"]);
    check("the old name still finds it (imports, old records)",
      sql("select public.call_result_from_text('DBDV', 'Viable-No Contact')") === String(RESULT["DBDV:Viable-CallBack"]));
    check("no name is left titled Viable-No Contact", sql("select count(*) from public.leads where call_result_dbdv = 'Viable-No Contact'") === "0");
    const id = newName();
    const { error } = await record(id, "Viable-CallBack");
    check("it works as before: stays on the list, called once", !error && lead(id).result === "Viable-CallBack" && lead(id).weight === 1 && lead(id).stage === "dbdev",
      error?.message ?? JSON.stringify(lead(id)));
  }

  section("A Lead needs its Ultimate X-Date");
  {
    const id = newName({ wc_xdate: "2027-02-15" });
    const refused = await record(id, "Lead");
    check("with only a policy line's date, a Lead is refused, saying why", /Ultimate X-Date/.test(refused.error?.message ?? ""), refused.error?.message);
    check("…and nothing changed", lead(id).stage === "dbdev" && lead(id).weight === 0 && lead(id).ultimate === null, JSON.stringify(lead(id)));
    const ok = await record(id, "Lead", { ultimate: "2027-02-15" });
    check("entered with the result, it is saved and the name is promoted", !ok.error && lead(id).ultimate === "2027-02-15" && lead(id).stage === "appt",
      ok.error?.message ?? JSON.stringify(lead(id)));

    const onFile = newName({ ultimate_xdate: "2027-06-01" });
    const kept = await record(onFile, "Lead");
    check("one already on the record is enough", !kept.error && lead(onFile).stage === "appt" && lead(onFile).ultimate === "2027-06-01", kept.error?.message);

    const changed = newName({ ultimate_xdate: "2027-06-01" });
    await record(changed, "Lead", { ultimate: "2027-07-01" });
    check("a different date given with the result replaces it", lead(changed).ultimate === "2027-07-01", JSON.stringify(lead(changed)));
  }

  section("An Appointment needs its X-date, date and time");
  {
    const id = newName();
    const noXdate = await record(id, "Appointment-Phone", { appointment: { date: tomorrow, time: "10:00 AM" } });
    check("without the Ultimate X-Date, refused", /Ultimate X-Date/.test(noXdate.error?.message ?? ""), noXdate.error?.message);
    const noTime = await record(id, "Appointment-Phone", { ultimate: "2027-04-01", appointment: { date: tomorrow } });
    check("without a time, refused, saying so", /appointment time/i.test(noTime.error?.message ?? ""), noTime.error?.message);
    check("…and the X-date given with it was not kept either", lead(id).ultimate === null);
    const ok = await record(id, "Appointment-Phone", { ultimate: "2027-04-01", appointment: { date: tomorrow, time: "2:00 PM" } });
    check("with all three, the appointment is set", !ok.error && sql(`select appt_time from public.appointments where lead_id=${id}`) === "2:00 PM", ok.error?.message);
  }

  section("Lead-Hot Lead");
  {
    check("the button is there, among the Leads", Boolean(RESULT["DBDV:Lead-Hot Lead"]));
    check("the old system's “X-Date Hot Lead” imports as it",
      sql("select public.call_result_from_text('DBDV', 'X-Date Hot Lead')") === String(RESULT["DBDV:Lead-Hot Lead"]));
    const id = newName({ ultimate_xdate: "2027-01-20" });
    const startNote = Number(sql("select coalesce(max(id), 0) from public.notifications"));
    const { data, error } = await record(id, "Lead-Hot Lead");
    const s = lead(id);
    check("promoted like a Lead, to the appointment manager", !error && data?.promoted === true && s.stage === "appt" && s.project_id === APPT && s.rep === MIKE,
      error?.message ?? JSON.stringify(s));
    check("…marked as an X-date hot lead", s.status === "hot", s.status);
    check("…paid at the Lead rate", sql(`select string_agg(kind || ':' || amount::text, ',') from public.pay_events where lead_id=${id}`) === "lead:10.00");
    check("…and the appointment manager is told it is a hot lead",
      Number(sql(`select count(*) from public.notifications where id > ${startNote} and user_id=${MIKE} and title like 'Hot lead assigned to you:%'`)) === 1);
  }
} finally {
  sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)} or body like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.pay_events where lead_id in (select id from public.leads where company_name like ${lit(`${TAG}%`)})`);
  sql(`update public.call_records set appointment_id = null where lead_id in (select id from public.leads where company_name like ${lit(`${TAG}%`)})`);
  sql(`delete from public.appointments where lead_id in (select id from public.leads where company_name like ${lit(`${TAG}%`)})`);
  sql(`delete from public.leads where company_name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.project_assignments where project_id in (select id from public.projects where name like ${lit(`${TAG}%`)})`);
  sql(`update public.projects set appt_project_id = null where name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.projects where name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.companies where name like ${lit(`${TAG}%`)}`);
}

finish("call results");
