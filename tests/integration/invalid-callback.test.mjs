/**
 * An invalid appointment, and a call back next year (Sean, Oct 2026): an
 * appointment found invalid stays counted as set and then invalid, from the
 * appointment itself, when its lead's result moves on; Call back later puts
 * the name back on its project's list on the day chosen (Lead-Not Shopping,
 * a call recorded with why, no pay, a reminder that morning), off the list
 * and its counts until then; another result in the meantime calls it as
 * usual; and an appointment set when it is called back counts as a new one.
 *
 * Removes everything it made.
 *
 *   node tests/integration/invalid-callback.test.mjs
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `IC-TEST ${Date.now()}`;
const one = (query) => JSON.parse(sql(`select coalesce(row_to_json(t), 'null') from (${query}) t`));
const all = (query) => JSON.parse(sql(`select coalesce(json_agg(t), '[]') from (${query}) t`));
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const MIKE = userId("mike@beacon.test");
const RESULT = Object.fromEntries(all("select id, name from public.call_results where project_type='APPT'").map((r) => [r.name, r.id]));
const type = (code) => sql(`select id from public.project_types where code='${code}'`);
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Co`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, lead_rate, appointment_rate, confirmation_rate)
  values (${lit(`${TAG} Appts`)}, ${company}, ${type("APPT")}, 1, 0, 40, 10) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${APPT}, ${MIKE})`);
const newName = (name) => Number(sql(`insert into public.leads (company_name, project_id, stage, assigned_user_id, result_id)
  values (${lit(`${TAG} ${name}`)}, ${APPT}, 'appt', ${MIKE}, ${RESULT["Lead-No Contact"]}) returning id`));
const ID = newName("Jen B's");
sql(`insert into public.insurance_details (lead_id, ultimate_xdate) values (${ID}, '2027-03-01')`);

const mike = await signIn("mike@beacon.test");
const admin = await signIn("admin@beacon.test");
const agent = await signIn("agent@beacon.test");
const client = await signIn("client@beacon.test");

const today = sql("select public.business_today()");
const day = (n) => sql(`select (public.business_today() + ${n})::text`);
const tomorrow = day(1);
const NEXT_YEAR = day(365);
const record = (leadId, name, extra = {}) => mike.sb.rpc("record_call_result", {
  p_lead_id: leadId, p_result_id: RESULT[name], p_notes: null, p_appointment: extra.appointment ?? null,
  p_corrected_xdate: null, p_ultimate_xdate: null,
});
const callBack = (who, leadId, on, note = null) => who.sb.rpc("call_back_later", { p_lead: leadId, p_on: on, p_note: note });
const lead = (id) => one(`select r.name as result, l.call_back_on::text as on, l.resolved_at is not null as resolved, s.code as status
  from public.leads l join public.call_results r on r.id=l.result_id left join public.lead_statuses s on s.id=l.status_id where l.id=${id}`);
const onList = async (leadId) => ((await mike.sb.rpc("call_list", { p_project_id: APPT, p_limit: 500 })).data ?? []).some((r) => r.id === leadId);
const left = async () => Number(((await mike.sb.rpc("work_projects")).data ?? []).find((p) => p.id === APPT)?.names_left ?? -1);
const net = (leadId) => Number(sql(`select coalesce(sum(amount), 0) from public.pay_events where lead_id=${leadId}`));
// names/left/active/resolved/developed/appts/invalid for the project; the clients' tiles; the client's dashboard.
const figures = async () => {
  const s = ((await admin.sb.rpc("lead_stats", { p_project_id: APPT })).data ?? [])[0] ?? {};
  const t = ((await admin.sb.rpc("clients_totals", { p_companies: [company] })).data ?? [])[0] ?? {};
  const d = (await admin.sb.rpc("client_dashboard", { p_from: null, p_company_id: company })).data ?? {};
  return { appts: Number(s.appointments), invalid: Number(s.invalid_appointments), tilesInvalid: Number(t.invalid_appointments),
           dashAppts: Number(d.appts), dashInvalid: Number(d.results?.invalid) };
};
const APPOINTMENT = { date: tomorrow, time: "10:30 AM", duration: 45, rep_name: "Bret Godsey" };

try {
  section("An appointment set, then found invalid");
  await record(ID, "Appointment", { appointment: APPOINTMENT });
  const { error: invErr } = await record(ID, "Appointment-Invalid");
  check("recorded invalid; its pay charged back", !invErr && net(ID) === 0, invErr?.message ?? net(ID));
  const before = await figures();
  check("counted invalid in the project, the clients' tiles and the client's dashboard",
    before.invalid === 1 && before.appts === 0 && before.tilesInvalid === 1 && before.dashAppts === 1 && before.dashInvalid === 1, JSON.stringify(before));

  section("What Call back later will not do");
  const past = await callBack(mike, ID, today);
  check("not today or before", /after today/i.test(past.error?.message ?? ""), past.error?.message);
  const far = await callBack(mike, ID, day(800));
  check("not more than two years out", /two years/i.test(far.error?.message ?? ""), far.error?.message);
  const plain = newName("never set");
  const notInvalid = await callBack(mike, plain, NEXT_YEAR);
  check("not a lead with no invalid appointment", /found invalid/i.test(notInvalid.error?.message ?? ""), notInvalid.error?.message);
  const stranger = await callBack(agent, ID, NEXT_YEAR);
  check("not someone off the project", /not on your call list/i.test(stranger.error?.message ?? ""), stranger.error?.message);
  const byClient = await callBack(client, ID, NEXT_YEAR);
  check("not a client", !!byClient.error);
  check("…and none of that touched it", lead(ID).result === "Appointment-Invalid" && lead(ID).on === null, JSON.stringify(lead(ID)));

  const listed = await left();

  section("Call back next year");
  const { data, error } = await callBack(mike, ID, NEXT_YEAR, "No time this year, call in the new year");
  const s = lead(ID);
  check("done: Lead-Not Shopping, to call back on the day", !error && data?.result === "Lead-Not Shopping" && s.result === "Lead-Not Shopping" && s.on === NEXT_YEAR && !s.resolved,
    error?.message ?? JSON.stringify(s));
  check("off the call list until then", !(await onList(ID)));
  check("…and out of the names left to call", (await left()) === listed, `${listed} → ${await left()}`);
  const call = one(`select c.notes, c.call_result, c.user_id from public.call_records c where c.lead_id=${ID} order by c.id desc limit 1`);
  check("a call recorded, saying why", call?.call_result === "Lead-Not Shopping" && call.user_id === MIKE && /Call back on .*No time this year/.test(call.notes ?? ""), JSON.stringify(call));
  check("…and in its notes", /Call back on/.test(sql(`select coalesce(notes, '') from public.lead_notes where lead_id=${ID}`)));
  const reminder = one(`select user_id, (remind_at at time zone public.business_tz())::text as at, note from public.reminders where lead_id=${ID} order by id desc limit 1`);
  check("its account manager reminded that morning", reminder?.user_id === MIKE && reminder.at === `${NEXT_YEAR} 09:00:00` && /No time this year/.test(reminder.note), JSON.stringify(reminder));
  check("no pay either way", net(ID) === 0, net(ID));
  const after = await figures();
  check("still counted set and invalid, everywhere", JSON.stringify(after) === JSON.stringify(before), JSON.stringify(after));

  section("The day comes");
  sql(`update public.leads set call_back_on = public.business_today() where id=${ID}`);
  check("on the list again", await onList(ID));
  check("…and counted to call", (await left()) === listed + 1, `${listed} → ${await left()}`);

  section("Another result in the meantime");
  sql(`update public.leads set call_back_on = ${lit(NEXT_YEAR)} where id=${ID}`);
  const { error: lmErr } = await record(ID, "Lead-Left Message");
  check("called as usual again", !lmErr && lead(ID).on === null && (await onList(ID)), lmErr?.message ?? JSON.stringify(lead(ID)));

  section("An appointment when called back: a new one");
  const { error: apErr } = await record(ID, "Appointment", { appointment: APPOINTMENT });
  const later = await figures();
  check("the new appointment counted, the invalid one still counted", !apErr && later.appts === 1 && later.invalid === 1 && later.tilesInvalid === 1,
    apErr?.message ?? JSON.stringify(later));
  check("…and paid as a new one", net(ID) === 40, net(ID));
} finally {
  sql(`delete from public.leads where company_name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.projects where id = ${APPT}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("invalid callback");
