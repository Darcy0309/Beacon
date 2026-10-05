/**
 * The administrator's side, against the database as real signed-in users:
 * who works a project and how its names are shared out as reps come and go;
 * a project's true totals; X-dates by month and the names behind each
 * number; and the daily production report, checked against the pay ledger,
 * with chargebacks (including one at a $0 rate) and the rule that only an
 * administrator sees anyone else's production.
 *
 * Runs on its own test client and removes everything it made.
 *
 *   npm run test:integration
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `ADM-TEST ${Date.now()}`;
const one = (query) => JSON.parse(sql(`select coalesce(row_to_json(t), 'null') from (${query}) t`));
const all = (query) => JSON.parse(sql(`select coalesce(json_agg(t), '[]') from (${query}) t`));
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));

const SEAN = userId("sean@beacon.test");
const MIKE = userId("mike@beacon.test");
const RACHEL = userId("rachel@beacon.test");
const BIANCA = userId("bianca@beacon.test");
const ANDRE = userId("andre@beacon.test"); // invited, not yet active
const CLIENT_USER = userId("client@beacon.test");
const RESULT = Object.fromEntries(all("select id, project_type, name from public.call_results").map((r) => [`${r.project_type}:${r.name}`, r.id]));

const companyId = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const typeId = (code) => sql(`select id from public.project_types where code=${lit(code)}`);
const project = (name, type, rates, link = "null") => Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id, lead_rate, appointment_rate, confirmation_rate)
  values (${lit(`${TAG} ${name}`)}, ${companyId}, ${typeId(type)}, 1, ${link}, ${rates.join(", ")}) returning id`));
const APPT = project("Appointments", "APPT", [0, 40, 10]);
const DBDV = project("DBDev", "DBDV", [15, 25, 5], APPT);
const OLD = project("Older DBDev", "DBDV", [0, 0, 0], APPT); // a source project still at $0
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${DBDV}, ${SEAN}), (${APPT}, ${MIKE})`);

let n = 0;
/** A fresh name, renewing on `xdate` (or with no renewal date); `more` sets other columns. */
function newName(projectId, rep, xdate = null, more = {}) {
  n += 1;
  const cols = { company_name: lit(`${TAG} Co ${String(n).padStart(2, "0")}`), project_id: projectId, assigned_user_id: rep ?? "null", ...more };
  const id = Number(sql(`insert into public.leads (${Object.keys(cols).join(", ")}) values (${Object.values(cols).join(", ")}) returning id`));
  if (xdate) sql(`insert into public.insurance_details (lead_id, ultimate_xdate) values (${id}, ${lit(xdate)})`);
  return id;
}
const holder = (leadId) => Number(sql(`select assigned_user_id from public.leads where id=${leadId}`));
const held = (projectId) => Object.fromEntries(all(`select l.assigned_user_id as uid, count(*)::int as n from public.leads l join public.call_results r on r.id=l.result_id
  where l.project_id=${projectId} and r.viable and r.callable group by 1`).map((r) => [r.uid ?? "none", r.n]));
const assignments = (projectId) => all(`select ae_user_id from public.project_assignments where project_id=${projectId} and ae_user_id is not null order by ae_user_id`).map((r) => r.ae_user_id);

const admin = await signIn("admin@beacon.test");
const sean = await signIn("sean@beacon.test");
const mike = await signIn("mike@beacon.test");
const rachel = await signIn("rachel@beacon.test");
const agent = await signIn("agent@beacon.test");
const as = (uid) => (uid === SEAN ? sean : uid === RACHEL ? rachel : uid === MIKE ? mike : null);

const record = (who, leadId, type, name, extra = {}) => who.sb.rpc("record_call_result", {
  p_lead_id: leadId, p_result_id: RESULT[`${type}:${name}`], p_notes: null,
  p_appointment: extra.appointment ?? null, p_corrected_xdate: null,
});
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const APPOINTMENT = { date: tomorrow, time: "10:30 AM", duration: 30, rep_name: "Bret Godsey" };

try {
  // Twelve names in the pool: four renew in March, two in July, one in October, five have no date.
  const names = [
    ...["2027-03-03", "2027-03-10", "2027-03-17", "2027-03-24"].map((d) => newName(DBDV, null, d)),
    ...["2027-07-01", "2027-07-15"].map((d) => newName(DBDV, null, d)),
    newName(DBDV, null, "2027-10-05"),
    ...Array.from({ length: 5 }, () => newName(DBDV, null)),
  ];

  section("Who works a project");
  {
    const { data, error } = await admin.sb.rpc("set_project_rep", { p_project_id: DBDV, p_user_id: SEAN, p_on: true });
    check("adding someone already on it shares the pool out to them", !error && held(DBDV)[SEAN] === 12, error?.message ?? JSON.stringify(held(DBDV)));
    check("…without a second assignment row", JSON.stringify(assignments(DBDV)) === JSON.stringify([SEAN]), JSON.stringify(assignments(DBDV)));
    check("…and says what it did", data?.reps === 1 && data?.names === 12, JSON.stringify(data));

    const b = await admin.sb.rpc("set_project_rep", { p_project_id: DBDV, p_user_id: BIANCA, p_on: true });
    check("an administrator adds an agent: 6 and 6", !b.error && held(DBDV)[SEAN] === 6 && held(DBDV)[BIANCA] === 6, b.error?.message ?? JSON.stringify(held(DBDV)));

    const r = await sean.sb.rpc("set_project_rep", { p_project_id: DBDV, p_user_id: RACHEL, p_on: true });
    check("an account manager can add one too: 4, 4 and 4", !r.error && [SEAN, BIANCA, RACHEL].every((u) => held(DBDV)[u] === 4), r.error?.message ?? JSON.stringify(held(DBDV)));

    const denied = await agent.sb.rpc("set_project_rep", { p_project_id: DBDV, p_user_id: MIKE, p_on: true });
    check("an agent cannot change who works a project", denied.error?.code === "42501", denied.error?.message);
    const invited = await admin.sb.rpc("set_project_rep", { p_project_id: DBDV, p_user_id: ANDRE, p_on: true });
    check("someone not yet active cannot be added", /active/i.test(invited.error?.message ?? ""), invited.error?.message);
    const clientUser = await admin.sb.rpc("set_project_rep", { p_project_id: DBDV, p_user_id: CLIENT_USER, p_on: true });
    check("nor can a client", /only staff/i.test(clientUser.error?.message ?? ""), clientUser.error?.message);

    const off = await admin.sb.rpc("set_project_rep", { p_project_id: DBDV, p_user_id: BIANCA, p_on: false });
    check("taking Bianca off gives her names to the others: 6 and 6", !off.error && held(DBDV)[SEAN] === 6 && held(DBDV)[RACHEL] === 6 && !held(DBDV)[BIANCA],
      off.error?.message ?? JSON.stringify(held(DBDV)));
    check("…and she is off the project", !assignments(DBDV).includes(BIANCA));

    // Whoever holds the first March name works it off their list.
    const worker = holder(names[0]);
    const { error: nqErr } = await record(as(worker), names[0], "DBDV", "Not Qualified");
    check("its rep records Not Qualified on a March name", !nqErr, nqErr?.message);

    const reps = (await admin.sb.rpc("project_reps", { p_project_id: DBDV })).data ?? [];
    const w = reps.find((x) => x.user_id === worker);
    const other = reps.find((x) => x.user_id !== worker);
    check("project_reps: that rep has 5 left of the 6 they hold, one call today", w?.names_left === 5 && w?.leads_held === 6 && w?.calls_today === 1 && w?.calls_month === 1 && w?.last_worked,
      JSON.stringify(w));
    check("…the other still has 6 and no calls", other?.names_left === 6 && other?.calls_today === 0 && other?.last_worked === null, JSON.stringify(other));
    check("project_reps: exactly who is on the project", JSON.stringify(reps.map((x) => x.user_id).sort()) === JSON.stringify([SEAN, RACHEL].sort()), JSON.stringify(reps.map((x) => x.user_id)));

    const o = (await admin.sb.rpc("project_overview", { p_project_id: DBDV })).data;
    check("project_overview: 12 leads, 11 left to call, 1 off the list, none waiting", o?.leads === 12 && o?.viable_left === 11 && o?.off_list === 1 && o?.unassigned === 0, JSON.stringify(o));
    check("…one call today and this month, in the 14-day series too", o?.calls_today === 1 && o?.calls_month === 1 && o?.calls_14d?.length === 14 && o.calls_14d.at(-1) === 1, JSON.stringify(o));
  }

  section("X-dates by month");
  {
    // An appointment on a July name moves it to the appointment project.
    const { error: aErr } = await record(as(holder(names[4])), names[4], "DBDV", "Appointment", { appointment: APPOINTMENT });
    check("an appointment set on a July name", !aErr, aErr?.message);

    const months = async (args) => Object.fromEntries(((await admin.sb.rpc("xdates_by_month", args)).data ?? []).map((r) => [r.month, r]));
    const dbdv = await months({ p_project_id: DBDV });
    check("DBDev project: March 4 (1 off the list, 3 viable)", dbdv[3]?.total === 4 && dbdv[3]?.off_list === 1 && dbdv[3]?.viable_left === 3 && dbdv[3]?.appointments === 0, JSON.stringify(dbdv[3]));
    check("…July 1 left (the other moved with its appointment)", dbdv[7]?.total === 1 && dbdv[7]?.viable_left === 1, JSON.stringify(dbdv[7]));
    check("…October 1, and 5 with no renewal date", dbdv[10]?.total === 1 && dbdv[0]?.total === 5, JSON.stringify({ oct: dbdv[10], none: dbdv[0] }));
    check("…every month's buckets add up to its total", Object.values(dbdv).every((m) => m.appointments + m.off_list + m.viable_left === m.total));

    const client = await months({ p_company_id: companyId });
    check("the whole client: July has the appointment", client[7]?.total === 2 && client[7]?.appointments === 1 && client[7]?.viable_left === 1, JSON.stringify(client[7]));

    const page = async (args) => (await admin.sb.rpc("xdate_month_leads", args)).data ?? [];
    const march = await page({ p_month: 3, p_project_id: DBDV, p_limit: 2 });
    check("names behind March: two a page, total 4, in renewal-day order", march.length === 2 && march[0].total === 4 && march[0].renewal_date === "2027-03-03",
      JSON.stringify(march.map((x) => [x.renewal_date, x.total])));
    const marchOff = await page({ p_month: 3, p_bucket: "off", p_project_id: DBDV });
    check("…the one off the list is the Not Qualified name", marchOff.length === 1 && marchOff[0].result === "Not Qualified" && marchOff[0].total === 1, JSON.stringify(marchOff));
    const julyAppt = await page({ p_month: 7, p_bucket: "appointment", p_company_id: companyId });
    check("…July's appointment, in the appointment project", julyAppt.length === 1 && julyAppt[0].id === names[4] && julyAppt[0].project === `${TAG} Appointments`, JSON.stringify(julyAppt));
    const undated = await page({ p_month: 0, p_project_id: DBDV, p_limit: 100 });
    check("…and month 0 lists the 5 without a date", undated.length === 5 && undated.every((x) => x.renewal_date === null));
  }

  section("Production and pay");
  {
    const today = sql("select (now() at time zone public.business_tz())::date");
    // A Lead (promotion) and an appointment on the DBDev project, then a confirmation of that appointment.
    const [p1, p2] = all(`select id from public.leads where project_id=${DBDV} and assigned_user_id=${SEAN}
      and result_id in (select id from public.call_results where viable and callable) order by id limit 2`).map((x) => x.id);
    check("two of Sean's names to work", Boolean(p1 && p2));
    const e1 = await record(sean, p1, "DBDV", "Lead");
    const e2 = await record(sean, p2, "DBDV", "Appointment", { appointment: APPOINTMENT });
    const e3 = await record(sean, p2, "DBDV", "Appointment-Confirmed");
    check("Sean: a Lead, an appointment and its confirmation", !e1.error && !e2.error && !e3.error, e1.error?.message ?? e2.error?.message ?? e3.error?.message);
    // Mike finds the promoted lead invalid: Sean's lead pay is charged back.
    const e4 = await record(mike, p1, "APPT", "Lead-Invalid");
    check("Mike marks the promoted lead invalid", !e4.error, e4.error?.message);

    // An older lead developed on a $0 project, with no payment on record: its chargeback is $0 but still a chargeback.
    const older = newName(APPT, MIKE, null, { source_project_id: OLD, dbdv_user_id: SEAN, stage: "'appt'" });
    const e5 = await record(mike, older, "APPT", "Lead-Invalid");
    const zero = one(`select amount::float as amount, is_chargeback from public.pay_events where lead_id=${older}`);
    check("a $0 chargeback with nothing to reverse is still marked a chargeback", !e5.error && zero?.amount === 0 && zero?.is_chargeback === true, e5.error?.message ?? JSON.stringify(zero));

    const ours = `(select id from public.projects where name like ${lit(`${TAG}%`)})`;
    const ledger = one(`select count(*) filter (where kind='lead' and not is_chargeback)::int as leads,
        count(*) filter (where kind='appointment' and not is_chargeback)::int as appointments,
        count(*) filter (where kind='confirmation' and not is_chargeback)::int as confirmations,
        count(*) filter (where is_chargeback)::int as chargebacks, coalesce(sum(amount), 0)::float as amount
      from public.pay_events where user_id=${SEAN} and project_id in ${ours}`);
    const calls = Number(sql(`select count(*) from public.call_records where user_id=${SEAN} and project_id in ${ours}`));

    const report = (await admin.sb.rpc("production_report", { p_from: today, p_to: today })).data ?? [];
    const seans = report.filter((r) => r.user_id === SEAN && [DBDV, APPT, OLD].includes(r.project_id));
    const sum = (k) => seans.reduce((acc, r) => acc + Number(r[k]), 0);
    check("the report agrees with the pay ledger for Sean today",
      sum("leads") === ledger.leads && sum("appointments") === ledger.appointments && sum("confirmations") === ledger.confirmations
        && sum("chargebacks") === ledger.chargebacks && Math.abs(sum("amount") - ledger.amount) < 0.001 && sum("calls") === calls,
      JSON.stringify({ report: { leads: sum("leads"), appts: sum("appointments"), conf: sum("confirmations"), back: sum("chargebacks"), amount: sum("amount"), calls: sum("calls") }, ledger, calls }));
    const these = one(`select coalesce(sum(amount), 0)::float as amount, count(*) filter (where is_chargeback)::int as chargebacks
      from public.pay_events where user_id=${SEAN} and lead_id in (${p1}, ${p2}, ${older})`);
    check("…on these three names: $15 + $25 + $5 − $15 − $0 = $30, two chargebacks", these.amount === 30 && these.chargebacks === 2, JSON.stringify(these));
    check("…all of it on today's date", seans.every((r) => r.day === today));

    const filtered = (await admin.sb.rpc("production_report", { p_from: today, p_to: today, p_project_id: OLD })).data ?? [];
    check("filtered to one project: only its rows", filtered.length > 0 && filtered.every((r) => r.project_id === OLD), JSON.stringify(filtered));

    const asAgent = (await agent.sb.rpc("production_report", { p_from: today, p_to: today, p_user_id: SEAN })).data ?? [];
    const agentId = userId("agent@beacon.test");
    check("an agent asking for Sean's production gets only their own", asAgent.every((r) => r.user_id === agentId), JSON.stringify(asAgent.slice(0, 2)));
    const asSean = (await sean.sb.rpc("production_report", { p_from: today, p_to: today, p_user_id: MIKE })).data ?? [];
    check("an account manager sees only their own too", asSean.length > 0 && asSean.every((r) => r.user_id === SEAN));
    const tooLong = await admin.sb.rpc("production_report", { p_from: "2025-01-01", p_to: "2026-06-01" });
    check("a range over a year is refused", /year or less/i.test(tooLong.error?.message ?? ""), tooLong.error?.message);

    section("Pay rates");
    const notAdmin = await sean.sb.rpc("set_project_rates", { p_project_id: DBDV, p_lead: 99, p_appointment: 99, p_confirmation: 99 });
    check("an account manager cannot set rates", notAdmin.error?.code === "42501", notAdmin.error?.message);
    const negative = await admin.sb.rpc("set_project_rates", { p_project_id: DBDV, p_lead: -1, p_appointment: 0, p_confirmation: 0 });
    check("a negative rate is refused", /negative/i.test(negative.error?.message ?? ""), negative.error?.message);
    const set = await admin.sb.rpc("set_project_rates", { p_project_id: DBDV, p_lead: 10.505, p_appointment: 30, p_confirmation: 7.5 });
    check("an administrator sets them, rounded to the cent", !set.error && Number(set.data?.lead_rate) === 10.51 && Number(set.data?.confirmation_rate) === 7.5, set.error?.message ?? JSON.stringify(set.data));
    const [p3] = all(`select id from public.leads where project_id=${DBDV} and assigned_user_id=${SEAN}
      and result_id in (select id from public.call_results where viable and callable) order by id limit 1`).map((x) => x.id);
    await record(sean, p3, "DBDV", "Lead");
    const paid = all(`select amount::float as amount from public.pay_events where user_id=${SEAN} and kind='lead' and not is_chargeback and project_id=${DBDV} order by id`).map((x) => x.amount);
    check("the next Lead is paid at the new rate; the earlier one keeps $15", JSON.stringify(paid) === JSON.stringify([15, 10.51]), JSON.stringify(paid));
  }

  section("The business day");
  {
    check("the business time zone defaults to Phoenix", sql("select public.business_tz()") === "America/Phoenix");
    sql("insert into public.app_settings (key, value) values ('business_timezone', '{\"name\": \"Not/AZone\"}') on conflict (key) do update set value = excluded.value");
    check("an unknown zone name falls back to Phoenix", sql("select public.business_tz()") === "America/Phoenix");
    sql("update public.app_settings set value = '{\"name\": \"America/New_York\"}' where key = 'business_timezone'");
    check("a real one is used", sql("select public.business_tz()") === "America/New_York");
  }
} finally {
  sql("delete from public.app_settings where key = 'business_timezone'");
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

finish("admin side");
