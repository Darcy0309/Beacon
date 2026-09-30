/**
 * The lead lifecycle, row by row against the client's sheet ("New Call Result
 * (Action Buttons) for AccountMgr Drop-Downs"): every result is recorded as a
 * real rep through record_call_result(), and what it did is read back from the
 * database: the call list, the weight, promotion, the appointment and its QA,
 * who the client hears from, and pay (chargebacks included).
 *
 * Runs on its own test client (a DBDev project linked to an Appt project, with
 * known pay rates) and removes everything it made.
 *
 *   npm run test:integration
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `LC-TEST ${Date.now()}`;
const one = (query) => JSON.parse(sql(`select coalesce(row_to_json(t), 'null') from (${query}) t`));
const all = (query) => JSON.parse(sql(`select coalesce(json_agg(t), '[]') from (${query}) t`));
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));

const SEAN = userId("sean@beacon.test");      // DBDev account manager
const MIKE = userId("mike@beacon.test");      // appointment manager
const RACHEL = userId("rachel@beacon.test");  // a second appointment manager
const CLIENT_USER = userId("client@beacon.test");

const RESULT = Object.fromEntries(all("select id, project_type, name from public.call_results").map((r) => [`${r.project_type}:${r.name}`, r.id]));

// --- A test client of our own ---------------------------------------------------
const companyId = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const typeId = (code) => sql(`select id from public.project_types where code=${lit(code)}`);
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, lead_rate, appointment_rate, confirmation_rate)
  values (${lit(`${TAG} Appointments`)}, ${companyId}, ${typeId("APPT")}, 1, 0, 40, 10) returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id, lead_rate, appointment_rate, confirmation_rate)
  values (${lit(`${TAG} DBDev`)}, ${companyId}, ${typeId("DBDV")}, 1, ${APPT}, 15, 25, 5) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${DBDV}, ${SEAN}), (${APPT}, ${MIKE}), (${APPT}, ${RACHEL})`);
// The portal user belongs to our test client for the duration, so we can see what they are told.
const clientCompany = sql(`select coalesce(company_id::text, 'null') from public.users where id=${CLIENT_USER}`);
sql(`update public.users set company_id=${companyId} where id=${CLIENT_USER}`);

let n = 0;
/** A fresh name on a project, held by `rep`. */
function newName(project, rep, extra = "") {
  n += 1;
  const id = Number(sql(`insert into public.leads (company_name, project_id, assigned_user_id) values (${lit(`${TAG} Co ${n}`)}, ${project}, ${rep ?? "null"}) returning id`));
  if (extra) sql(extra.replaceAll("$ID", String(id)));
  return id;
}
const lead = (id) => one(`select l.stage, l.project_id, r.name as result, l.call_weight as weight, l.assigned_user_id as rep, l.dbdv_user_id as developer,
  l.resolved_at is not null as resolved, s.code as status, l.call_result_dbdv as dbdv, l.call_result_appt as appt, l.original_xdate,
  public.lead_renewal_date(l.id) as renewal
  from public.leads l join public.call_results r on r.id=l.result_id left join public.lead_statuses s on s.id=l.status_id where l.id=${id}`);
const pay = (leadId) => all(`select user_id, kind, amount::float as amount, reverses_id is not null as chargeback from public.pay_events where lead_id=${leadId} order by id`);
const appt = (leadId) => one(`select a.id, a.project_id, a.set_project_id, a.set_stage, a.qa_status, a.user_id, s.name as status, a.confirmed_at is not null as confirmed, a.invalid_at is not null as invalid
  from public.appointments a left join public.appointment_statuses s on s.id=a.status_id where a.lead_id=${leadId} order by a.id desc limit 1`);
const clientTold = (leadId, like) => Number(sql(`select count(*) from public.notifications n join public.leads l on l.id=${leadId}
  where n.user_id=${CLIENT_USER} and n.title like ${lit(`${like}%`)} || l.company_name`));

const sean = await signIn("sean@beacon.test");
const mike = await signIn("mike@beacon.test");
const admin = await signIn("admin@beacon.test");
const agent = await signIn("agent@beacon.test");
const client = await signIn("client@beacon.test");

async function record(who, leadId, type, name, extra = {}) {
  const { data, error } = await who.sb.rpc("record_call_result", {
    p_lead_id: leadId, p_result_id: RESULT[`${type}:${name}`], p_notes: extra.notes ?? null,
    p_appointment: extra.appointment ?? null, p_corrected_xdate: extra.xdate ?? null,
  });
  return { data, error };
}
async function onList(who, project, leadId) {
  const { data, error } = await who.sb.rpc("call_list", { p_project_id: project, p_limit: 500 });
  if (error) throw error;
  return data.some((r) => r.id === leadId);
}
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const APPOINTMENT = { date: tomorrow, time: "10:30 AM", duration: 45, rep_name: "Bret Godsey" };

try {
  section("DBDev: results that keep the name on the list");
  for (const name of ["Viable-No Contact", "Viable-Staged", "Viable-Left Message", "Viable-Email"]) {
    const id = newName(DBDV, SEAN);
    const { error } = await record(sean, id, "DBDV", name, { notes: "called" });
    const s = lead(id);
    check(`${name}: recorded`, !error, error?.message);
    check(`${name}: stays on Sean's list, weight 1, titled as the result`, (await onList(sean, DBDV, id)) && s.weight === 1 && s.result === name && !s.resolved, JSON.stringify(s));
  }
  {
    const id = newName(DBDV, SEAN);
    await record(sean, id, "DBDV", "Viable-Staged");
    check("Viable-Staged marks the name as an X-date profile", lead(id).status === "profile");
  }

  section("DBDev: results that resolve the name");
  const RESOLVED = { "Not Interested": "not_interested", "Disco#": "disconnected", "Out of Business": "out_of_business", Branch: "removed",
                     Removed: "removed", "Not Qualified": "not_qualified", DoNotCall: "do_not_call", Client: "removed" };
  for (const [name, status] of Object.entries(RESOLVED)) {
    const id = newName(DBDV, SEAN);
    const { error } = await record(sean, id, "DBDV", name);
    const s = lead(id);
    check(`${name}: off the list, resolved on the DBDev project as "${name}"`, !error && !(await onList(sean, DBDV, id)) && s.resolved && s.stage === "dbdev" && s.project_id === DBDV && s.status === status && s.dbdv === name, error?.message ?? JSON.stringify(s));
  }

  section("DBDev: Pending");
  {
    const id = newName(DBDV, SEAN);
    const { error } = await record(sean, id, "DBDV", "Pending");
    const s = lead(id);
    check("Pending: still viable, but on nobody's list until released", !error && !s.resolved && s.rep === null && !(await onList(sean, DBDV, id)), error?.message ?? JSON.stringify(s));
  }

  section("DBDev: Lead (promotion)");
  const promoted = newName(DBDV, SEAN, `insert into public.insurance_details (lead_id, ultimate_xdate, pkg_xdate) values ($ID, '2027-03-01', '2027-05-01')`);
  {
    const { data, error } = await record(sean, promoted, "DBDV", "Lead");
    const s = lead(promoted);
    check("Lead: recorded", !error, error?.message);
    check("Lead: off Sean's DBDev list", !(await onList(sean, DBDV, promoted)));
    check("Lead: promoted to the linked Appt project as Lead-No Contact, weight 0", s.stage === "appt" && s.project_id === APPT && s.result === "Lead-No Contact" && s.weight === 0 && !s.resolved, JSON.stringify(s));
    check("Lead: handed to an appointment manager on that project", [MIKE, RACHEL].includes(s.rep), `rep ${s.rep}`);
    check("Lead: Sean recorded as the developer", s.developer === SEAN);
    check("Lead: Sean paid the DBDev project's lead rate ($15)", JSON.stringify(pay(promoted)) === JSON.stringify([{ user_id: SEAN, kind: "lead", amount: 15, chargeback: false }]), JSON.stringify(pay(promoted)));
    check("Lead: the RPC reports the promotion", data?.promoted === true && data?.on_list === true);
    const rep = s.rep === MIKE ? mike : await signIn("rachel@beacon.test");
    check("Lead: now on that appointment manager's list", await onList(rep, APPT, promoted));
  }
  {
    // Least-loaded: the next promotion goes to the other appointment manager.
    const first = lead(promoted).rep;
    const id = newName(DBDV, SEAN);
    await record(sean, id, "DBDV", "Lead");
    check("Lead: promotions alternate to the appointment manager with fewer names", lead(id).rep !== first && [MIKE, RACHEL].includes(lead(id).rep));
  }

  section("DBDev: Appointment / Appointment-Phone");
  const dbdvAppts = {};
  for (const name of ["Appointment", "Appointment-Phone"]) {
    const id = newName(DBDV, SEAN);
    const noDate = await record(sean, id, "DBDV", name);
    check(`${name}: refused without a date`, /appointment date/i.test(noDate.error?.message ?? ""), noDate.error?.message);
    check(`${name}: the refusal changed nothing`, lead(id).stage === "dbdev" && lead(id).weight === 0);
    const { error } = await record(sean, id, "DBDV", name, { appointment: APPOINTMENT });
    const s = lead(id);
    const a = appt(id);
    check(`${name}: recorded`, !error, error?.message);
    check(`${name}: promoted to the Appt project as "${name}", and resolved (not on any list)`, s.project_id === APPT && s.stage === "appt" && s.result === name && s.resolved && !(await onList(mike, APPT, id)), JSON.stringify(s));
    check(`${name}: stays with Sean, who set it and confirms it`, s.rep === SEAN && s.developer === SEAN);
    check(`${name}: on the project calendar, staged for QA`, a?.project_id === APPT && a.set_project_id === DBDV && a.set_stage === "dbdev" && a.qa_status === "pending" && a.status === "Scheduled" && a.user_id === SEAN, JSON.stringify(a));
    check(`${name}: Sean paid the DBDev appointment rate ($25)`, JSON.stringify(pay(id)) === JSON.stringify([{ user_id: SEAN, kind: "appointment", amount: 25, chargeback: false }]), JSON.stringify(pay(id)));
    check(`${name}: the client is not told before QA`, clientTold(id, "Appointment set: ") === 0);
    const { data: visible } = await client.sb.from("appointments").select("id").eq("lead_id", id);
    check(`${name}: the client cannot see it before QA`, (visible ?? []).length === 0);
    dbdvAppts[name] = id;
  }
  check("Status: Appointment is a survey appointment, Appointment-Phone a phone one",
    lead(dbdvAppts.Appointment).status === "survey" && lead(dbdvAppts["Appointment-Phone"]).status === "appt");

  section("Follow-up: Appointment-Confirmed, then QA");
  {
    const id = dbdvAppts.Appointment;
    const { error } = await record(sean, id, "APPT", "Appointment-Confirmed"); // the button id of either list works
    const a = appt(id);
    check("Confirmed: Sean (not on the Appt project) can confirm the appointment he set", !error, error?.message);
    check("Confirmed: appointment marked Confirmed", a.status === "Confirmed" && a.confirmed);
    check("Confirmed: recorded against the DBDev stage it was set on", lead(id).dbdv === "Appointment-Confirmed");
    check("Confirmed: Sean paid the DBDev confirmation rate ($5)", pay(id).some((p) => p.kind === "confirmation" && p.amount === 5 && p.user_id === SEAN), JSON.stringify(pay(id)));
    check("Confirmed: the client still hears nothing until QA passes", clientTold(id, "Appointment confirmed: ") === 0);
    const again = await record(sean, id, "DBDV", "Appointment-Confirmed");
    check("Confirmed: cannot be confirmed twice", /already confirmed/i.test(again.error?.message ?? ""), again.error?.message);

    const byManager = await mike.sb.rpc("review_appointment_qa", { p_appointment_id: a.id, p_passed: true });
    check("QA: an account manager cannot pass QA", !!byManager.error, byManager.error?.message);
    const { error: qaErr } = await admin.sb.rpc("review_appointment_qa", { p_appointment_id: a.id, p_passed: true, p_note: "Recording checked" });
    check("QA: an administrator passes it", !qaErr, qaErr?.message);
    check("QA: the client is told, as confirmed", clientTold(id, "Appointment confirmed: ") === 1);
    const { data: visible } = await client.sb.from("appointments").select("id").eq("lead_id", id);
    check("QA: the client can now see it", (visible ?? []).length === 1);
    const twice = await admin.sb.rpc("review_appointment_qa", { p_appointment_id: a.id, p_passed: true });
    check("QA: cannot be reviewed twice", !!twice.error);
  }
  {
    const id = dbdvAppts["Appointment-Phone"];
    const a = appt(id);
    const { error } = await admin.sb.rpc("review_appointment_qa", { p_appointment_id: a.id, p_passed: false, p_note: "No decision maker" });
    check("QA fail: recorded", !error, error?.message);
    check("QA fail: the setter is told why", Number(sql(`select count(*) from public.notifications where user_id=${SEAN} and title like 'Appointment failed QA:%' and body='No decision maker'`)) >= 1);
    check("QA fail: the client is never told", clientTold(id, "Appointment") === 0);
  }

  section("Appointment-Invalid (set from DBDev): charged back");
  {
    const id = dbdvAppts["Appointment-Phone"];
    const { error } = await record(admin, id, "DBDV", "Appointment-Invalid");
    const a = appt(id);
    const s = lead(id);
    check("Invalid: recorded", !error, error?.message);
    check("Invalid: appointment marked Invalid, out of the appointment totals", a.invalid && a.status === "Invalid");
    check("Invalid: the name stays a lead on the Appt project", s.project_id === APPT && s.status === "xdate" && s.appt === "Appointment-Invalid" && s.dbdv === "Appointment-Invalid", JSON.stringify(s));
    check("Invalid: Sean's $25 appointment pay is reversed", JSON.stringify(pay(id).map((p) => [p.kind, p.amount])) === JSON.stringify([["appointment", 25], ["appointment", -25]]), JSON.stringify(pay(id)));
    const again = await record(admin, id, "DBDV", "Appointment-Invalid");
    check("Invalid: nothing left to invalidate a second time", /no appointment/i.test(again.error?.message ?? ""), again.error?.message);
  }
  {
    // A confirmed appointment that turns out invalid gives back both payments.
    const id = newName(DBDV, SEAN);
    await record(sean, id, "DBDV", "Appointment", { appointment: APPOINTMENT });
    await record(sean, id, "DBDV", "Appointment-Confirmed");
    await record(admin, id, "DBDV", "Appointment-Invalid");
    const total = pay(id).reduce((sum, p) => sum + p.amount, 0);
    check("Invalid after confirming: appointment and confirmation pay both reversed (net $0)", total === 0 && pay(id).filter((p) => p.chargeback).length === 2, JSON.stringify(pay(id)));
  }

  section("DBDev: what the list will not take");
  {
    const id = newName(DBDV, SEAN);
    const appt = await record(sean, id, "APPT", "Lead-No Contact");
    check("An Appt result on a DBDev name is refused", /not a result for database-development/i.test(appt.error?.message ?? ""), appt.error?.message);
    const report = await record(sean, id, "DBDV", "Lead-Invalid");
    check("Lead-Invalid is not a DBDev button (it is set by the Appt manager)", /recorded automatically/i.test(report.error?.message ?? ""), report.error?.message);
    const stranger = await record(agent, id, "DBDV", "Not Interested");
    check("Someone not on the project cannot record on the name", /not on your call list/i.test(stranger.error?.message ?? ""), stranger.error?.message);
    const byClient = await record(client, id, "DBDV", "Not Interested");
    check("A client cannot record results", !!byClient.error);
    check("…and none of that touched the name", lead(id).weight === 0 && lead(id).result === "Viable-No Contact");
  }
  {
    // A DBDev project not linked to an Appt project cannot promote.
    const lonely = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Unlinked`)}, ${companyId}, ${typeId("DBDV")}, 1) returning id`));
    sql(`insert into public.project_assignments (project_id, ae_user_id) values (${lonely}, ${SEAN})`);
    const id = newName(lonely, SEAN);
    const { error } = await record(sean, id, "DBDV", "Lead");
    check("Lead on an unlinked DBDev project: refused, asking for the link", /link .* to an appointment project/i.test(error?.message ?? ""), error?.message);
    check("…and nothing was paid or moved", pay(id).length === 0 && lead(id).project_id === lonely && lead(id).weight === 0);
  }

  section("Appt: results that keep the lead on the list");
  for (const name of ["Lead-No Contact", "Lead-Left Message", "Lead-Email"]) {
    const id = newName(APPT, MIKE);
    const { error } = await record(mike, id, "APPT", name);
    const s = lead(id);
    check(`${name}: stays on Mike's list, weight 1`, !error && (await onList(mike, APPT, id)) && s.weight === 1 && s.result === name && !s.resolved, error?.message ?? JSON.stringify(s));
  }

  section("Appt: results that resolve the lead");
  for (const name of ["Lead-Never Shops", "Lead-Removed", "Lead-DoNotCall", "Lead-Out of Business", "Lead-Branch", "Lead-Not Qualified", "Lead-Client"]) {
    const id = newName(APPT, MIKE);
    const { error } = await record(mike, id, "APPT", name);
    check(`${name}: off the list, resolved`, !error && !(await onList(mike, APPT, id)) && lead(id).resolved && lead(id).appt === name, error?.message);
  }

  section("Appt: Appointment / Appointment-Phone / Confirmed");
  for (const name of ["Appointment", "Appointment-Phone"]) {
    const id = newName(APPT, MIKE);
    const { error } = await record(mike, id, "APPT", name, { appointment: APPOINTMENT });
    const a = appt(id);
    check(`${name}: off the list, on the calendar, staged for QA`, !error && !(await onList(mike, APPT, id)) && a.project_id === APPT && a.set_project_id === APPT && a.set_stage === "appt" && a.qa_status === "pending", error?.message ?? JSON.stringify(a));
    check(`${name}: Mike paid the Appt project's appointment rate ($40)`, pay(id).length === 1 && pay(id)[0].amount === 40 && pay(id)[0].user_id === MIKE, JSON.stringify(pay(id)));
    if (name === "Appointment") {
      const { error: cErr } = await record(mike, id, "APPT", "Appointment-Confirmed");
      check("Appointment-Confirmed: Mike paid the Appt confirmation rate ($10)", !cErr && pay(id).some((p) => p.kind === "confirmation" && p.amount === 10), cErr?.message ?? JSON.stringify(pay(id)));
      const { error: iErr } = await record(mike, id, "APPT", "Appointment-Invalid");
      check("Appointment-Invalid: Mike's $40 and $10 are reversed", !iErr && pay(id).reduce((s, p) => s + p.amount, 0) === 0, iErr?.message ?? JSON.stringify(pay(id)));
    }
  }
  {
    const id = newName(APPT, MIKE);
    const { error } = await record(mike, id, "APPT", "Appointment", { appointment: { ...APPOINTMENT, time: "half past ten" } });
    check("A badly written time is refused", /9:30 AM/.test(error?.message ?? ""), error?.message);
    const past = await record(mike, id, "APPT", "Appointment", { appointment: { ...APPOINTMENT, date: "2020-01-01" } });
    check("A date in the past is refused", /has passed/i.test(past.error?.message ?? ""), past.error?.message);
  }

  section("Appt: Lead-Corrected");
  {
    const id = newName(APPT, MIKE, `insert into public.insurance_details (lead_id, ultimate_xdate, wc_xdate) values ($ID, '2027-06-01', '2027-03-15')`);
    const missing = await record(mike, id, "APPT", "Lead-Corrected");
    check("Corrected: refused without the new date", /corrected renewal date/i.test(missing.error?.message ?? ""), missing.error?.message);
    const { error } = await record(mike, id, "APPT", "Lead-Corrected", { xdate: "2027-09-15" });
    const s = lead(id);
    check("Corrected: the renewal is now the corrected date", !error && s.renewal === "2027-09-15", error?.message ?? JSON.stringify(s));
    check("Corrected: the original renewal is kept (the ultimate X-date, June)", s.original_xdate === "2027-06-01", JSON.stringify(s));
    check("Corrected: a note of the change is on the call", /Renewal corrected from June 2027 to September 2027/.test(sql(`select notes from public.call_records where lead_id=${id} order by id desc limit 1`)));
    check("Corrected: the policy lines keep their own dates", sql(`select wc_xdate from public.insurance_details where lead_id=${id}`) === "2027-03-15");
    check("Corrected: stays on the list", await onList(mike, APPT, id));
    await record(mike, id, "APPT", "Lead-Corrected", { xdate: "2027-10-01" });
    check("Corrected twice: the original is still the first one", lead(id).original_xdate === "2027-06-01" && lead(id).renewal === "2027-10-01");
  }

  section("Appt: Lead-Invalid charges back the DBDev rep who developed it");
  {
    const rep = lead(promoted).rep === MIKE ? mike : await signIn("rachel@beacon.test");
    const { error } = await record(rep, promoted, "APPT", "Lead-Invalid");
    const s = lead(promoted);
    check("Lead-Invalid: recorded by the appointment manager", !error, error?.message);
    check("Lead-Invalid: off the list, shown as invalid on both stages", !(await onList(rep, APPT, promoted)) && s.appt === "Lead-Invalid" && s.dbdv === "Lead-Invalid" && s.status === "invalid", JSON.stringify(s));
    check("Lead-Invalid: Sean's $15 lead pay reversed", JSON.stringify(pay(promoted).map((p) => [p.user_id, p.amount])) === JSON.stringify([[SEAN, 15], [SEAN, -15]]), JSON.stringify(pay(promoted)));
    check("Lead-Invalid: Sean is told", Number(sql(`select count(*) from public.notifications n join public.leads l on l.id=${promoted}
      where n.user_id=${SEAN} and n.title='Lead marked invalid: ' || l.company_name`)) === 1);
  }

  section("The call list: weighted, cycling, Not Shopping last");
  {
    const cycle = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Cycle`)}, ${companyId}, ${typeId("APPT")}, 1) returning id`));
    sql(`insert into public.project_assignments (project_id, ae_user_id) values (${cycle}, ${MIKE})`);
    const [a, b, c, d] = [newName(cycle, MIKE), newName(cycle, MIKE), newName(cycle, MIKE), newName(cycle, MIKE)];
    const order = async () => ((await mike.sb.rpc("call_list", { p_project_id: cycle })).data ?? []).map((r) => r.id);
    check("Fresh list: in the order the names arrived", JSON.stringify(await order()) === JSON.stringify([a, b, c, d]));
    await record(mike, d, "APPT", "Lead-Not Shopping");
    check("Not Shopping goes to the end even with the fewest calls behind it", (await order()).at(-1) === d);
    await record(mike, a, "APPT", "Lead-Left Message");
    check("A called name drops behind the uncalled ones", JSON.stringify(await order()) === JSON.stringify([b, c, a, d]));
    await record(mike, b, "APPT", "Lead-No Contact");
    await record(mike, c, "APPT", "Lead-Email");
    check("Once everyone has one call, the list starts over (oldest call first)", JSON.stringify(await order()) === JSON.stringify([a, b, c, d]));
    const { data: rows } = await mike.sb.rpc("call_list", { p_project_id: cycle, p_limit: 2 });
    check("The list reports the full count alongside a page", rows?.length === 2 && Number(rows[0].total) === 4);
    const peek = await agent.sb.rpc("call_list", { p_project_id: cycle, p_rep: MIKE });
    check("An agent cannot open someone else's list", !!peek.error);
    const { data: seen, error: seenErr } = await admin.sb.rpc("call_list", { p_project_id: cycle, p_rep: MIKE });
    check("An administrator can", !seenErr && seen?.length === 4, seenErr?.message);
  }

  section("Distribution");
  {
    const pool = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Pool`)}, ${companyId}, ${typeId("DBDV")}, 1) returning id`));
    const ids = Array.from({ length: 10 }, () => newName(pool, null));
    const counts = () => Object.fromEntries(all(`select l.assigned_user_id as uid, count(*)::int as n from public.leads l join public.call_results r on r.id=l.result_id
      where l.project_id=${pool} and r.viable and r.callable and l.assigned_user_id is not null group by 1`).map((r) => [r.uid, r.n]));
    const byAgent = await agent.sb.rpc("distribute_project_names", { p_project_id: pool });
    check("An agent cannot distribute names", !!byAgent.error);
    const none = await admin.sb.rpc("distribute_project_names", { p_project_id: pool });
    check("Nobody assigned: nothing to do, said plainly", !none.error && /nobody is assigned/i.test(none.data?.message ?? ""));
    sql(`insert into public.project_assignments (project_id, ae_user_id) values (${pool}, ${SEAN}), (${pool}, ${RACHEL})`);
    await admin.sb.rpc("distribute_project_names", { p_project_id: pool });
    check("1,000 names / 10 managers → 100 each: here 10 / 2 → 5 each", JSON.stringify(Object.values(counts()).sort()) === JSON.stringify([5, 5]), JSON.stringify(counts()));
    // Sean resolves two: his pool shrinks, and a redistribution does not take Rachel's to refill it.
    const seans = all(`select id from public.leads where project_id=${pool} and assigned_user_id=${SEAN} order by id limit 2`).map((r) => r.id);
    for (const id of seans) await record(sean, id, "DBDV", "Not Interested");
    check("Resolved names shrink the rep's pool", counts()[SEAN] === 3 && counts()[RACHEL] === 5, JSON.stringify(counts()));
    sql(`insert into public.project_assignments (project_id, ae_user_id) values (${pool}, ${MIKE})`);
    const { data: out, error } = await admin.sb.rpc("distribute_project_names", { p_project_id: pool });
    check("Adding a manager shares the 8 names still to call 3 / 3 / 2", !error && JSON.stringify(Object.values(counts()).sort()) === JSON.stringify([2, 3, 3]) && out.names === 8, error?.message ?? JSON.stringify(counts()));
    check("Resolved names stay with whoever resolved them", seans.every((id) => lead(id).rep === SEAN));
    sql(`delete from public.project_assignments where project_id=${pool} and ae_user_id=${RACHEL}`);
    await admin.sb.rpc("distribute_project_names", { p_project_id: pool });
    check("Removing a manager hands their names back out: 4 / 4", JSON.stringify(Object.values(counts()).sort()) === JSON.stringify([4, 4]) && !counts()[RACHEL], JSON.stringify(counts()));
    void ids;
  }

  section("Pay and rates are protected");
  {
    const { data: mine } = await sean.sb.from("pay_events").select("user_id");
    check("A rep sees only their own pay", (mine ?? []).length > 0 && mine.every((p) => p.user_id === SEAN));
    const { data: theirs } = await client.sb.from("pay_events").select("id");
    check("A client sees no pay at all", (theirs ?? []).length === 0);
    const { error: insErr } = await sean.sb.from("pay_events").insert({ user_id: SEAN, kind: "lead", amount: 1000 });
    check("Nobody can write pay directly", !!insErr);
    const { error: rateErr } = await sean.sb.from("projects").update({ lead_rate: 999 }).eq("id", DBDV);
    check("An account manager cannot change pay rates", /administrator can set pay rates/i.test(rateErr?.message ?? ""), rateErr?.message);
    const { error: linkErr } = await admin.sb.from("projects").update({ appt_project_id: DBDV }).eq("id", APPT);
    check("Only a DBDev project can promote to an Appt project", !!linkErr, linkErr?.message);
  }
} finally {
  // Everything this run made, in dependency order.
  sql(`update public.users set company_id=${clientCompany} where id=${CLIENT_USER}`);
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

finish("lifecycle");
