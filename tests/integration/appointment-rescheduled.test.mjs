/**
 * Appointment-Rescheduled (Sean, Nov 2026): "when they have to reschedule an appointment that was already set
 * (either after they received negative pay for it being invalid or when they call to confirm an appt and the
 * prospect needs to reschedule to a different date/time)".
 *   Confirming, moved     the same appointment on its new day, to be confirmed again (a confirmed one's
 *                         confirmation pay taken back until it is), the client told, counted against its setter
 *   Invalid, set again    an appointment again: its pay back as a new appointment, confirmation pending,
 *                         counted as an appointment (not invalid) again, off the call list
 *   Not allowed           the same day and time, a day gone by, no appointment, someone else's
 *
 * Removes everything it made.
 *
 *   node tests/run.mjs tests/integration/appointment-rescheduled.test.mjs
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `RS-TEST ${Date.now()}`;
const one = (query) => JSON.parse(sql(`select coalesce(row_to_json(t), 'null') from (${query}) t`));
const all = (query) => JSON.parse(sql(`select coalesce(json_agg(t), '[]') from (${query}) t`));
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const MIKE = userId("mike@beacon.test");
const RESULT = Object.fromEntries(all("select id, name from public.call_results where project_type='APPT'").map((r) => [r.name, r.id]));
const type = (code) => sql(`select id from public.project_types where code='${code}'`);
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Co`)}) returning id`));
const CLIENT_USER = Number(sql(`select id from public.users where email='client@beacon.test'`));
const clientCompanyBefore = sql(`select coalesce(company_id::text, 'null') from public.users where id=${CLIENT_USER}`);
sql(`update public.users set company_id=${company} where id=${CLIENT_USER}`);
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, lead_rate, appointment_rate, confirmation_rate)
  values (${lit(`${TAG} Appts`)}, ${company}, ${type("APPT")}, 1, 0, 40, 10) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${APPT}, ${MIKE})`);
const newName = (name) => {
  const id = Number(sql(`insert into public.leads (company_name, project_id, stage, assigned_user_id, result_id)
    values (${lit(`${TAG} ${name}`)}, ${APPT}, 'appt', ${MIKE}, ${RESULT["Lead-No Contact"]}) returning id`));
  sql(`insert into public.insurance_details (lead_id, ultimate_xdate) values (${id}, '2027-03-01')`);
  return id;
};

const mike = await signIn("mike@beacon.test");
const admin = await signIn("admin@beacon.test");
const sean = await signIn("sean@beacon.test");

const day = (n) => sql(`select (public.business_today() + ${n})::text`);
const record = (who, leadId, name, appointment = null) => who.sb.rpc("record_call_result", {
  p_lead_id: leadId, p_result_id: RESULT[name], p_notes: null, p_appointment: appointment,
  p_corrected_xdate: null, p_ultimate_xdate: null,
});
const appt = (leadId) => one(`select a.appt_date::text as date, a.appt_time as time, a.invalid_at is not null as invalid, a.confirmed_at is not null as confirmed,
  a.rescheduled_count as times, s.name as status from public.appointments a left join public.appointment_statuses s on s.id=a.status_id
  where a.lead_id=${leadId} order by a.id desc limit 1`);
const appts = (leadId) => Number(sql(`select count(*) from public.appointments where lead_id=${leadId}`));
const lead = (id) => one(`select r.name as result, l.call_result_appt as appt_result, l.resolved_at is not null as resolved, l.call_back_on::text as back
  from public.leads l join public.call_results r on r.id=l.result_id where l.id=${id}`);
const pay = (leadId, kind) => Number(sql(`select coalesce(sum(amount), 0) from public.pay_events where lead_id=${leadId} and kind=${lit(kind)}`));
const lastCall = (leadId) => one(`select c.call_result as result, c.notes from public.call_records c where c.lead_id=${leadId} order by c.id desc limit 1`);
const clientNews = (leadId) => all(`select n.title, n.body from public.notifications n where n.user_id=${CLIENT_USER} and n.title like ${lit(`Appointment rescheduled: ${TAG}%`)}
  and n.title like ${lit(`%${sql(`select company_name from public.leads where id=${leadId}`)}`)}`);
const onList = async (leadId) => ((await mike.sb.rpc("call_list", { p_project_id: APPT, p_limit: 500 })).data ?? []).some((r) => r.id === leadId);
const counted = async () => {
  const s = ((await admin.sb.rpc("lead_stats", { p_project_id: APPT })).data ?? [])[0] ?? {};
  return { appts: Number(s.appointments), invalid: Number(s.invalid_appointments) };
};
const movedFor = async (who, uid) => Number(((await who.sb.rpc("rescheduled_appointments", { p_from: day(0), p_to: day(0) })).data ?? [])
  .find((r) => r.user_id === uid)?.rescheduled ?? 0);

const made = [];
try {
  section("Calling to confirm, the prospect moves it");
  const A = newName("Delta Door");
  made.push(A);
  await record(mike, A, "Appointment", { date: day(1), time: "9:30 AM", duration: 30 });
  sql(`update public.appointments set qa_status='passed' where lead_id=${A}`);
  const { data: moved, error: movedErr } = await record(mike, A, "Appointment-Rescheduled", { date: day(8), time: "1:00 PM", duration: 45 });
  check("saved", !movedErr && moved?.result === "Appointment-Rescheduled", movedErr?.message);
  const a1 = appt(A);
  check("the same appointment, on its new day and time, Rescheduled", appts(A) === 1 && a1.date === day(8) && a1.time === "1:00 PM" && a1.status === "Rescheduled" && a1.times === 1, JSON.stringify(a1));
  check("its appointment pay as it was; no confirmation pay yet", pay(A, "appointment") === 40 && pay(A, "confirmation") === 0, `${pay(A, "appointment")}/${pay(A, "confirmation")}`);
  check("the call says where it moved from", /Appointment moved from .+ 9:30 AM to .+ 1:00 PM/.test(lastCall(A).notes ?? ""), lastCall(A).notes);
  check("the lead is still an Appointment, off the list", lead(A).result === "Appointment" && lead(A).resolved && !(await onList(A)), JSON.stringify(lead(A)));
  check("the client is told in Lighthouse, with the new day", clientNews(A).length === 1 && /Now .+ at 1:00 PM/.test(clientNews(A)[0].body), JSON.stringify(clientNews(A)));
  check("counted against Mike, who set it", (await movedFor(admin, MIKE)) === 1);
  check("…which he sees, and Sean (not his) doesn't", (await movedFor(mike, MIKE)) === 1 && (await movedFor(sean, MIKE)) === 0);

  section("Confirmed, then moved: confirmed again, paid once");
  await record(mike, A, "Appointment-Confirmed");
  check("confirmed: $10", pay(A, "confirmation") === 10 && appt(A).confirmed);
  await record(mike, A, "Appointment-Rescheduled", { date: day(10), time: "2:00 PM" });
  check("moved: to be confirmed again, its $10 taken back", !appt(A).confirmed && pay(A, "confirmation") === 0 && lead(A).result === "Appointment", `${pay(A, "confirmation")} ${JSON.stringify(appt(A))}`);
  const { error: againErr } = await record(mike, A, "Appointment-Confirmed");
  check("confirmed again: $10, once", !againErr && pay(A, "confirmation") === 10, againErr?.message ?? pay(A, "confirmation"));

  section("Marked invalid (pay taken back), then set again");
  const B = newName("Cactus Freight");
  made.push(B);
  await record(mike, B, "Appointment", { date: day(1), time: "10:00 AM" });
  await record(mike, B, "Appointment-Confirmed");
  await record(mike, B, "Appointment-Invalid");
  check("invalid: appointment and confirmation pay taken back", pay(B, "appointment") === 0 && pay(B, "confirmation") === 0 && appt(B).invalid);
  const before = await counted();
  const { error: setErr } = await record(mike, B, "Appointment-Rescheduled", { date: day(5), time: "11:00 AM" });
  check("set again", !setErr, setErr?.message);
  const b1 = appt(B);
  check("an appointment again: not invalid, not confirmed, on the new day", appts(B) === 1 && !b1.invalid && !b1.confirmed && b1.date === day(5) && b1.status === "Rescheduled", JSON.stringify(b1));
  check("its appointment pay added back; the confirmation's still to come", pay(B, "appointment") === 40 && pay(B, "confirmation") === 0, `${pay(B, "appointment")}/${pay(B, "confirmation")}`);
  const after = await counted();
  check("counted an appointment again, not an invalid one", after.appts === before.appts + 1 && after.invalid === before.invalid - 1, JSON.stringify({ before, after }));
  check("the lead an Appointment, off the list", lead(B).result === "Appointment" && lead(B).appt_result === "Appointment" && !(await onList(B)), JSON.stringify(lead(B)));
  check("the call says it was invalid", /\(marked invalid\) to /.test(lastCall(B).notes ?? ""), lastCall(B).notes);
  await record(mike, B, "Appointment-Confirmed");
  check("confirmed: $10", pay(B, "confirmation") === 10);

  section("What it won't do");
  const same = await record(mike, A, "Appointment-Rescheduled", { date: day(10), time: "2:00 PM" });
  check("the same day and time", /set for then already/i.test(same.error?.message ?? ""), same.error?.message);
  const gone = await record(mike, A, "Appointment-Rescheduled", { date: day(-2), time: "2:00 PM" });
  check("a day gone by", /has passed/i.test(gone.error?.message ?? ""), gone.error?.message);
  const noTime = await record(mike, A, "Appointment-Rescheduled", { date: day(12) });
  check("no time", /new appointment time/i.test(noTime.error?.message ?? ""), noTime.error?.message);
  const C = newName("No Appt");
  made.push(C);
  const none = await record(mike, C, "Appointment-Rescheduled", { date: day(3), time: "9:00 AM" });
  check("no appointment to reschedule", /no appointment to reschedule/i.test(none.error?.message ?? ""), none.error?.message);
  const theirs = await record(sean, A, "Appointment-Rescheduled", { date: day(12), time: "9:00 AM" });
  check("not someone else's", /not on your call list/i.test(theirs.error?.message ?? ""), theirs.error?.message);
} finally {
  if (made.length) {
    const ids = made.join(",");
    sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)}`);
    sql(`delete from public.pay_events where lead_id in (${ids})`);
    sql(`update public.appointments set call_record_id = null where lead_id in (${ids})`);
    sql(`delete from public.delivery_holds where lead_id in (${ids})`);
    sql(`delete from public.call_records where lead_id in (${ids})`);
    sql(`delete from public.appointments where lead_id in (${ids})`);
    sql(`delete from public.lead_notes where lead_id in (${ids})`);
    sql(`delete from public.insurance_details where lead_id in (${ids})`);
    sql(`delete from public.leads where id in (${ids})`);
  }
  sql(`update public.users set company_id=${clientCompanyBefore} where id=${CLIENT_USER}`);
  sql(`delete from public.project_assignments where project_id=${APPT}`);
  sql(`delete from public.projects where id=${APPT}`);
  sql(`delete from public.companies where id=${company}`);
}

finish("appointment rescheduled");
