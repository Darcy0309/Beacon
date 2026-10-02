/**
 * The October audit's fixes, against the database as real signed-in users:
 * recording an appointment again moves it rather than booking and paying a
 * second; a lead pays its developer once; QA and confirmation marks cannot
 * be written around their own steps; a client files feedback only on their
 * own leads; the client hears of an appointment from the rep who set it;
 * dashboard figures count the business's days and leave invalid
 * appointments out; and the business time zone refuses names a browser
 * would not understand.
 *
 * Runs on its own test client and removes everything it made.
 *
 *   npm run test:integration
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `AUDIT-TEST ${Date.now()}`;
const one = (query) => JSON.parse(sql(`select coalesce(row_to_json(t), 'null') from (${query}) t`));
const all = (query) => JSON.parse(sql(`select coalesce(json_agg(t), '[]') from (${query}) t`));
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));

const SEAN = userId("sean@beacon.test");
const MIKE = userId("mike@beacon.test");
const CLIENT_USER = userId("client@beacon.test");
const RESULT = Object.fromEntries(all("select id, project_type, name from public.call_results").map((r) => [`${r.project_type}:${r.name}`, r.id]));

const companyId = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const typeId = (code) => sql(`select id from public.project_types where code=${lit(code)}`);
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, lead_rate, appointment_rate, confirmation_rate)
  values (${lit(`${TAG} Appointments`)}, ${companyId}, ${typeId("APPT")}, 1, 0, 40, 10) returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id, lead_rate, appointment_rate, confirmation_rate)
  values (${lit(`${TAG} DBDev`)}, ${companyId}, ${typeId("DBDV")}, 1, ${APPT}, 15, 25, 5) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${DBDV}, ${SEAN}), (${APPT}, ${MIKE})`);
// The portal user belongs to our test client for the duration.
const clientCompany = sql(`select coalesce(company_id::text, 'null') from public.users where id=${CLIENT_USER}`);
sql(`update public.users set company_id=${companyId} where id=${CLIENT_USER}`);

let n = 0;
const newName = (project, rep) => {
  n += 1;
  return Number(sql(`insert into public.leads (company_name, project_id, assigned_user_id) values (${lit(`${TAG} Co ${n}`)}, ${project}, ${rep ?? "null"}) returning id`));
};
const appts = (leadId) => all(`select a.id, a.appt_date::text as date, a.appt_time as time, a.qa_status as qa, s.name as status from public.appointments a
  left join public.appointment_statuses s on s.id=a.status_id where a.lead_id=${leadId} order by a.id`);
const paid = (leadId, kind) => Number(sql(`select count(*) from public.pay_events where lead_id=${leadId} and kind=${lit(kind)} and not is_chargeback`));
const day = (offset) => sql(`select ((now() at time zone public.business_tz())::date + ${offset})::text`);

const sean = await signIn("sean@beacon.test");
const mike = await signIn("mike@beacon.test");
const agent = await signIn("agent@beacon.test");
const client = await signIn("client@beacon.test");

const record = (who, leadId, type, name, appointment = null) =>
  who.sb.rpc("record_call_result", { p_lead_id: leadId, p_result_id: RESULT[`${type}:${name}`], p_notes: null, p_appointment: appointment, p_corrected_xdate: null });

try {
  section("Recording an appointment again moves it");
  {
    const id = newName(APPT, MIKE);
    const first = await record(mike, id, "APPT", "Appointment", { date: day(3), time: "9:30 AM" });
    check("the first books it", !first.error && first.data?.rescheduled === false, first.error?.message);
    const again = await record(mike, id, "APPT", "Appointment-Phone", { date: day(5), time: "2:00 PM", duration: 60 });
    check("the second says it moved it", !again.error && again.data?.rescheduled === true, again.error?.message ?? JSON.stringify(again.data));
    const rows = appts(id);
    check("one appointment, on the new day and time", rows.length === 1 && rows[0].date === day(5) && rows[0].time === "2:00 PM", JSON.stringify(rows));
    check("marked Rescheduled", rows[0]?.status === "Rescheduled", rows[0]?.status);
    check("paid once", paid(id, "appointment") === 1, String(paid(id, "appointment")));
    const note = sql(`select notes from public.call_records where lead_id=${id} order by id desc limit 1`);
    check("the call says what moved", note.includes("Appointment moved from") && note.includes("2:00 PM"), note);

    // Failed at QA, it no longer counts as the name's appointment: a new one is set.
    const qa = await agent.sb.rpc("review_appointment_qa", { p_appointment_id: rows[0].id, p_passed: false, p_note: "No decision maker" });
    check("QA fails it", !qa.error, qa.error?.message);
    const fresh = await record(mike, id, "APPT", "Appointment", { date: day(8), time: "11:00 AM" });
    check("after a failed QA, a new appointment is booked", !fresh.error && fresh.data?.rescheduled === false && appts(id).length === 2,
      fresh.error?.message ?? JSON.stringify(appts(id)));
  }

  section("A lead pays its developer once");
  {
    const id = newName(DBDV, SEAN);
    const promoted = await record(sean, id, "DBDV", "Lead");
    check("promoting pays the lead", !promoted.error && paid(id, "lead") === 1, promoted.error?.message);
    // Moved back to its DBDev project by hand (the project change resets its stage) and promoted again.
    sql(`update public.leads set project_id=${DBDV}, assigned_user_id=${SEAN} where id=${id}`);
    const again = await record(sean, id, "DBDV", "Lead");
    check("promoting it again pays nothing more", !again.error && paid(id, "lead") === 1, again.error?.message ?? String(paid(id, "lead")));
  }

  section("QA and confirmation only through their own steps");
  {
    const id = newName(APPT, MIKE);
    const { data: made, error } = await mike.sb.from("appointments").insert({ lead_id: id, appt_date: day(2), qa_status: "passed" }).select("id, qa_status").single();
    check("an appointment saved directly waits for QA, whatever it claims", !error && made?.qa_status === "pending", error?.message ?? JSON.stringify(made));
    const { error: passErr } = await mike.sb.from("appointments").update({ qa_status: "passed" }).eq("id", made?.id ?? 0);
    check("a manager cannot pass QA by writing it", Boolean(passErr), "write allowed");
    const { error: confErr } = await mike.sb.from("appointments").update({ confirmed_at: new Date().toISOString() }).eq("id", made?.id ?? 0);
    check("nor confirm one by writing it", Boolean(confErr), "write allowed");
    const { error: editErr } = await mike.sb.from("appointments").update({ appt_time: "3:00 PM" }).eq("id", made?.id ?? 0);
    check("other details can still be edited", !editErr, editErr?.message);
    const visible = await client.sb.from("appointments").select("id").eq("id", made?.id ?? 0);
    check("the client does not see it before QA", (visible.data ?? []).length === 0, JSON.stringify(visible.data));
  }

  section("A client's feedback: their own leads, filed now, as Open");
  {
    const own = newName(APPT, MIKE);
    const elsewhere = Number(sql(`insert into public.leads (company_name) values (${lit(`${TAG} Someone Else`)}) returning id`));
    const theirs = await client.sb.from("feedback").insert({ lead_id: elsewhere, user_id: CLIENT_USER, content: `${TAG} not mine` });
    check("not on another client's lead", Boolean(theirs.error), "insert allowed");
    const mine = await client.sb.from("feedback")
      .insert({ lead_id: own, user_id: CLIENT_USER, content: `${TAG} mine`, fb_status_id: 4, created_at: "2020-01-01T00:00:00Z" })
      .select("fb_status_id, created_at").single();
    const open = Number(sql("select id from public.fb_statuses where name='Open'"));
    check("on their own lead, as Open and dated now", !mine.error && mine.data?.fb_status_id === open && mine.data.created_at.slice(0, 4) !== "2020",
      mine.error?.message ?? JSON.stringify(mine.data));
  }

  section("The client hears of an appointment from the rep who set it");
  {
    const id = newName(APPT, MIKE);
    await record(mike, id, "APPT", "Appointment", { date: day(4), time: "10:00 AM" });
    const [a] = appts(id);
    const qa = await agent.sb.rpc("review_appointment_qa", { p_appointment_id: a.id, p_passed: true });
    check("QA passes it", !qa.error, qa.error?.message);
    const told = one(`select n.sender_id, n.sender_name from public.notifications n join public.leads l on l.id=${id}
      where n.user_id=${CLIENT_USER} and n.title like '%' || l.company_name order by n.id desc limit 1`);
    check("from the rep who set it, not the QA reviewer", told?.sender_id === MIKE && /Mike/.test(told?.sender_name ?? ""), JSON.stringify(told));
  }

  section("Dashboard figures on the business's day");
  {
    const before = (await mike.sb.rpc("dashboard_stats")).data;
    const id = newName(APPT, MIKE);
    sql(`insert into public.appointments (lead_id, appt_date, qa_status) values (${id}, ${lit(day(20))}, 'passed'), (${id}, ${lit(day(0))}, 'passed')`);
    const after = (await mike.sb.rpc("dashboard_stats")).data;
    check("a meeting next month is not in this week's count", after.appts_7d - before.appts_7d === 1, `${before.appts_7d} → ${after.appts_7d}`);
    check("today's is today's, where the business is", after.appts_today - before.appts_today === 1, `${before.appts_today} → ${after.appts_today}`);
    sql(`update public.appointments set invalid_at=now() where lead_id=${id} and appt_date=${lit(day(0))}`);
    const invalid = (await mike.sb.rpc("dashboard_stats")).data;
    check("one marked invalid drops out", invalid.appts_today === before.appts_today && invalid.appts_total === before.appts_total + 1,
      `${invalid.appts_today} today, ${invalid.appts_total} total`);
    const months = (await mike.sb.rpc("report_stats")).data?.months ?? [];
    check("report months end with the business's month", months.at(-1)?.key === day(0).slice(0, 7), JSON.stringify(months.at(-1)));
  }

  section("The business time zone");
  {
    sql("insert into public.app_settings (key, value) values ('business_timezone', '{\"name\": \"posix/America/New_York\"}') on conflict (key) do update set value = excluded.value");
    check("a posix/ name falls back to Phoenix", sql("select public.business_tz()") === "America/Phoenix");
    sql("update public.app_settings set value = '{\"name\": \"Factory\"}' where key = 'business_timezone'");
    check("so does Factory", sql("select public.business_tz()") === "America/Phoenix");
  }

  section("Internal functions are closed to signed-out callers");
  {
    check("mfa_status", sql("select has_function_privilege('anon', 'public.mfa_status()', 'execute')") === "f");
    check("send_notification", sql("select has_function_privilege('anon', 'public.send_notification(bigint[],text[],text,text,text)', 'execute')") === "f");
    check("notify_users is internal", sql("select has_function_privilege('authenticated', 'public.notify_users(bigint[],text,text,text,text,text,uuid,bigint)', 'execute')") === "f");
  }
} finally {
  sql("delete from public.app_settings where key = 'business_timezone'");
  sql(`update public.users set company_id=${clientCompany} where id=${CLIENT_USER}`);
  sql(`delete from public.feedback where content like ${lit(`${TAG}%`)}`);
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

finish("audit fixes");
