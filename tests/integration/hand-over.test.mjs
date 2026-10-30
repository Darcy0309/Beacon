/**
 * Handing over a manager's work (Sean, Oct 2026): a manager leaves; an
 * administrator hands what they still had to do to another manager in one
 * step (their projects in their place, open names, appointments to follow
 * up, reminders still to go off, the clients they look after) while what
 * they did stays theirs (calls, leads developed, appointments set, pay).
 * The one taking over confirms the appointments and hears of them.
 *
 * Removes everything it made.
 *
 *   node tests/integration/hand-over.test.mjs
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `HO-TEST ${Date.now()}`;
const one = (q) => JSON.parse(sql(`select coalesce(row_to_json(t), 'null') from (${q}) t`));
const RACHEL = Number(sql(`select id from public.users where email = 'rachel@beacon.test'`));
const result = (name) => Number(sql(`select id from public.call_results where project_type = 'APPT' and name = ${lit(name)}`));
// The manager who leaves: an account of this test's own.
const JEN = Number(sql(`insert into public.users (email, first_name, last_name, role, status)
  values (${lit(`ho.${Date.now()}@beacon.test`)}, 'Jen', ${lit(`B ${TAG}`)}, 'manager', 'active') returning id`));
const company = Number(sql(`insert into public.companies (name, sales_rep_id) values (${lit(`${TAG} Co`)}, ${JEN}) returning id`));
sql(`insert into public.client_watchers (company_id, user_id, by_email) values (${company}, ${JEN}, true)`);
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appointment_rate)
  values (${lit(`${TAG} Appts`)}, ${company}, (select id from public.project_types where code = 'APPT'), 1, 40) returning id`));
const OTHER = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} Both`)}, ${company}, (select id from public.project_types where code = 'APPT'), 1) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${APPT}, ${JEN}), (${OTHER}, ${JEN}), (${OTHER}, ${RACHEL})`);
const lead = (name, res, extra = "") => Number(sql(`insert into public.leads (company_name, project_id, stage, assigned_user_id, dbdv_user_id, result_id)
  values (${lit(`${TAG} ${name}`)}, ${APPT}, 'appt', ${JEN}, ${JEN}, ${result(res)}) returning id`) + extra);
const OPEN = lead("Open", "Lead-Viable");
const DONE = lead("Done", "Lead-Never Shops");
const BOOKED = lead("Booked", "Appointment");
const today = sql("select public.business_today()::text");
const appt = (leadId, days, extra = "") => Number(sql(`insert into public.appointments (lead_id, user_id, project_id, set_project_id, set_stage, appt_date, appt_time, status_id, qa_status${extra ? ", invalid_at" : ""})
  values (${leadId}, ${JEN}, ${APPT}, ${APPT}, 'appt', public.business_today() + ${days}, '10:00 AM', (select id from public.appointment_statuses where name = 'Scheduled'), 'passed'${extra ? `, ${extra}` : ""}) returning id`));
const SOON = appt(BOOKED, 3);
const OLD = appt(DONE, -60);
sql(`insert into public.call_records (lead_id, project_id, user_id, call_result, result_id, stage, call_date, appointment_id)
  values (${BOOKED}, ${APPT}, ${JEN}, 'Appointment', ${result("Appointment")}, 'appt', now() - interval '2 days', ${SOON})`);
sql(`insert into public.pay_events (user_id, project_id, lead_id, appointment_id, kind, amount, note) values (${JEN}, ${APPT}, ${BOOKED}, ${SOON}, 'appointment', 40, ${lit(TAG)})`);
const DUE = Number(sql(`insert into public.reminders (lead_id, user_id, remind_at, note) values (${OPEN}, ${JEN}, now() + interval '2 days', 'Call back Tues') returning id`));
const GONE = Number(sql(`insert into public.reminders (lead_id, user_id, remind_at, note, sent_at) values (${OPEN}, ${JEN}, now() - interval '1 day', 'Old', now()) returning id`));
sql(`insert into public.calendar_feeds (user_id, project_id, url, provider) values (${JEN}, ${APPT}, 'https://example.test/jen.ics', 'ics')`);

const admin = await signIn("admin@beacon.test");
const rachel = await signIn("rachel@beacon.test");
const mike = await signIn("mike@beacon.test");

try {
  section("What they hold");
  const { data: held, error: heldErr } = await admin.sb.rpc("hand_over_work", { p_from: JEN, p_to: null });
  // Their reminders still to go off: the one they set, and any the appointment brought with it.
  const pending = Number(sql(`select count(*) from public.reminders where user_id = ${JEN} and sent_at is null`));
  check("counted, nothing moved: 2 projects, the open name and the appointment, 1 appointment to follow up, their reminders, the client",
    !heldErr && held.projects === 2 && held.names === 2 && held.appointments === 1 && held.reminders === pending && pending >= 1 && held.clients === 1
      && held.watching === 1 && held.calendars === 1 && sql(`select assigned_user_id from public.leads where id = ${OPEN}`) === String(JEN),
    heldErr?.message ?? JSON.stringify(held));
  check("…only an administrator", Boolean((await mike.sb.rpc("hand_over_work", { p_from: JEN, p_to: null })).error));
  check("…not to themselves", /someone else/i.test((await admin.sb.rpc("hand_over_work", { p_from: JEN, p_to: JEN })).error?.message ?? ""));

  section("Handed over");
  const { data, error } = await admin.sb.rpc("hand_over_work", { p_from: JEN, p_to: RACHEL });
  check("done", !error, error?.message ?? JSON.stringify(data));
  check("their projects: Rachel in their place, once where she was already",
    sql(`select string_agg(project_id || ':' || ae_user_id, ',' order by project_id) from public.project_assignments where project_id in (${APPT}, ${OTHER})`) === `${APPT}:${RACHEL},${OTHER}:${RACHEL}`);
  check("their open names hers; a resolved one keeps who held it",
    sql(`select string_agg(company_name || '=' || (assigned_user_id = ${RACHEL}), ',' order by id) from public.leads where id in (${OPEN}, ${DONE}, ${BOOKED})`)
      === `${TAG} Open=true,${TAG} Done=false,${TAG} Booked=true`);
  const a = one(`select user_id, follow_up_user_id from public.appointments where id = ${SOON}`);
  check("the appointment still to come: set by Jen still, followed up by Rachel", a.user_id === JEN && a.follow_up_user_id === RACHEL, JSON.stringify(a));
  check("…one long past left as it was", sql(`select coalesce(follow_up_user_id::text, 'none') from public.appointments where id = ${OLD}`) === "none");
  check("the reminder still to go off is hers; the one sent stays Jen's",
    sql(`select user_id from public.reminders where id = ${DUE}`) === String(RACHEL) && sql(`select user_id from public.reminders where id = ${GONE}`) === String(JEN));
  check("the client: Rachel its Sales Rep, and hears about it as Jen did",
    sql(`select sales_rep_id from public.companies where id = ${company}`) === String(RACHEL)
      && sql(`select string_agg(user_id || ':' || by_email, ',') from public.client_watchers where company_id = ${company}`) === `${RACHEL}:true`);
  check("Jen's synced calendar comes off", sql(`select count(*) from public.calendar_feeds where user_id = ${JEN}`) === "0");
  check("what Jen did stays hers: the lead developed, the call, the pay",
    sql(`select dbdv_user_id from public.leads where id = ${BOOKED}`) === String(JEN)
      && sql(`select count(*) from public.call_records where lead_id = ${BOOKED} and user_id = ${JEN}`) === "1"
      && Number(sql(`select coalesce(sum(amount), 0) from public.pay_events where lead_id = ${BOOKED} and user_id = ${JEN}`)) === 40);
  check("Rachel is told what is hers now", Number(sql(`select count(*) from public.notifications where user_id = ${RACHEL} and title like ${lit(`You have taken over Jen B ${TAG}%`)}`)) === 1);

  section("Rachel follows it up");
  const toConfirm = ((await rachel.sb.rpc("work_projects")).data ?? []).find((p) => p.id === APPT);
  check("it is hers to confirm on her projects", Boolean(toConfirm), JSON.stringify(toConfirm));
  const { error: cErr } = await rachel.sb.rpc("record_call_result", {
    p_lead_id: BOOKED, p_result_id: result("Appointment-Confirmed"), p_notes: null, p_appointment: null, p_corrected_xdate: null, p_ultimate_xdate: null,
  });
  check("she confirms it; Jen keeps the appointment's pay", !cErr
    && sql(`select confirmed_by from public.appointments where id = ${SOON}`) === String(RACHEL)
    && Number(sql(`select coalesce(sum(amount), 0) from public.pay_events where lead_id = ${BOOKED} and user_id = ${JEN} and kind = 'appointment'`)) === 40, cErr?.message);
  check("…set by Jen still", sql(`select user_id from public.appointments where id = ${SOON}`) === String(JEN));

  section("Nothing left to hand over");
  const { data: after } = await admin.sb.rpc("hand_over_work", { p_from: JEN, p_to: null });
  check("Jen holds nothing still to do", after.projects === 0 && after.names === 0 && after.appointments === 0 && after.reminders === 0 && after.clients === 0, JSON.stringify(after));
} finally {
  sql(`delete from public.notifications where user_id = ${RACHEL} and title like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.pay_events where lead_id in (select id from public.leads where company_name like ${lit(`${TAG}%`)})`);
  sql(`delete from public.appointments where lead_id in (select id from public.leads where company_name like ${lit(`${TAG}%`)})`);
  sql(`delete from public.leads where company_name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.calendar_feeds where user_id = ${JEN}`);
  sql(`delete from public.projects where id in (${APPT}, ${OTHER})`);
  sql(`delete from public.companies where id = ${company}`);
  sql(`delete from public.users where id = ${JEN}`);
}

finish("hand over");
