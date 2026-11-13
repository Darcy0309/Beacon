/**
 * Pay and bonus additions (Sean, Nov 2026), against the database as real signed-in users:
 *   Dec Sheet Pay      ticked with a file on the lead, the project's rate, once a lead; the rate set by an
 *                      administrator or the client's Sales Rep; unticked, taken back
 *   A manager's rates  their own appointment rate in place of the project's; the project's confirmation
 *   Lead-Corrected     the developer's lead pay moves to whoever corrects it, once; a lead with no
 *                      developer names one (or nobody)
 *   Special Pay        asked of the project's Sales Rep, approved (adjusted) and paid, or declined
 *   Bonuses            a lead manager's units in a half period (and the congrats); an appointment
 *                      manager's week paid the period after, an invalid counted against it; a month's tiers
 *
 * Runs on its own client and projects and removes everything it made (and puts the bonus plans back).
 *
 *   node tests/run.mjs tests/integration/pay-extras.test.mjs
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `PAYX ${Date.now()}`;
const one = (query) => JSON.parse(sql(`select coalesce(row_to_json(t), 'null') from (${query}) t`));
const all = (query) => JSON.parse(sql(`select coalesce(json_agg(t), '[]') from (${query}) t`));
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const SEAN = userId("sean@beacon.test");
const MIKE = userId("mike@beacon.test");
const RACHEL = userId("rachel@beacon.test");
const RESULT = Object.fromEntries(all("select id, project_type, name from public.call_results").map((r) => [`${r.project_type}:${r.name}`, r.id]));
const typeId = (code) => sql(`select id from public.project_types where code=${lit(code)}`);

const company = Number(sql(`insert into public.companies (name, sales_rep_id) values (${lit(`${TAG} Insurance`)}, ${RACHEL}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, lead_rate, appointment_rate, confirmation_rate)
  values (${lit(`${TAG} Appointments`)}, ${company}, ${typeId("APPT")}, 1, 12, 35, 5) returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id, lead_rate, appointment_rate, confirmation_rate)
  values (${lit(`${TAG} DBDev`)}, ${company}, ${typeId("DBDV")}, 1, ${APPT}, 10, 30, 5) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${DBDV}, ${SEAN}), (${APPT}, ${MIKE})`);

const profiles = all(`select * from public.pay_profiles where user_id in (${SEAN}, ${MIKE}, ${RACHEL})`);
const plansBefore = sql("select value::text from public.app_settings where key = 'bonus_plans'") || null;
const setPlans = (v) => sql(`insert into public.app_settings (key, value) values ('bonus_plans', ${lit(JSON.stringify(v))}::jsonb) on conflict (key) do update set value = excluded.value`);
const profile = (uid, fields) => sql(`insert into public.pay_profiles (user_id, ${Object.keys(fields).join(", ")}) values (${uid}, ${Object.values(fields).map((v) => (v === null ? "null" : lit(v))).join(", ")})
  on conflict (user_id) do update set ${Object.keys(fields).map((k) => `${k} = excluded.${k}`).join(", ")}`);

let n = 0;
const newLead = (projectId, rep, extra = "") => {
  n += 1;
  return Number(sql(`insert into public.leads (company_name, project_id, assigned_user_id${extra ? `, ${extra.split("=")[0]}` : ""})
    values (${lit(`${TAG} Co ${n}`)}, ${projectId}, ${rep}${extra ? `, ${extra.split("=")[1]}` : ""}) returning id`));
};
const attach = (leadId) => sql(`insert into public.documents (name, file_type, storage_path, lead_id, uploaded_by) values ('dec.pdf', 'application/pdf', ${lit(`test/${TAG}/${leadId}.pdf`)}, ${leadId}, ${SEAN})`);
const events = (leadId) => all(`select user_id, kind, amount::float as amount, is_chargeback from public.pay_events where lead_id = ${leadId} order by id`);
const today = sql("select (now() at time zone public.business_tz())::date::text");

const [sean, mike, rachel, admin] = await Promise.all(["sean", "mike", "rachel", "admin"].map((u) => signIn(`${u}@beacon.test`)));

try {
  section("Dec Sheet Pay");
  {
    check("$10 a project unless set", Number(sql(`select dec_sheet_rate from public.projects where id = ${DBDV}`)) === 10);
    const bySean = await sean.sb.rpc("set_project_dec_sheet_rate", { p_project_id: DBDV, p_rate: 15 });
    check("a manager who isn't the client's Sales Rep can't set it", /Sales Rep/.test(bySean.error?.message ?? ""), bySean.error?.message);
    const direct = await sean.sb.from("projects").update({ dec_sheet_rate: 25 }).eq("id", DBDV).select("id");
    check("…nor write it directly", Boolean(direct.error) || !direct.data?.length, JSON.stringify(direct));
    const byRep = await rachel.sb.rpc("set_project_dec_sheet_rate", { p_project_id: DBDV, p_rate: 15 });
    check("the client's Sales Rep sets $15", !byRep.error && Number(sql(`select dec_sheet_rate from public.projects where id = ${DBDV}`)) === 15, byRep.error?.message);

    const id = newLead(DBDV, SEAN);
    const bare = await sean.sb.rpc("set_dec_sheet", { p_lead_id: id, p_on: true });
    check("no file on the lead: attach it first", /Attach the policy information/.test(bare.error?.message ?? ""), bare.error?.message);
    attach(id);
    attach(id);
    const ok = await sean.sb.rpc("set_dec_sheet", { p_lead_id: id, p_on: true });
    check("ticked with a file: paid the project's $15", !ok.error && events(id).some((e) => e.kind === "dec_sheet" && e.amount === 15 && e.user_id === SEAN), ok.error?.message ?? JSON.stringify(events(id)));
    check("…kept on the lead, with the file", one(`select dec_sheet_by, dec_sheet_document_id is not null as doc from public.leads where id = ${id}`)?.dec_sheet_by === SEAN);
    const again = await sean.sb.rpc("set_dec_sheet", { p_lead_id: id, p_on: true });
    check("once a lead, however many files", /already marked/.test(again.error?.message ?? "") && events(id).filter((e) => e.kind === "dec_sheet").length === 1);
    const forged = await sean.sb.from("leads").update({ dec_sheet_at: null }).eq("id", id).select("id");
    check("not unmarked by writing the lead", Boolean(forged.error) || !forged.data?.length);
    const byOther = await mike.sb.rpc("set_dec_sheet", { p_lead_id: id, p_on: false });
    check("someone else can't untick it", /Only whoever marked/.test(byOther.error?.message ?? ""), byOther.error?.message);
    const off = await sean.sb.rpc("set_dec_sheet", { p_lead_id: id, p_on: false });
    check("unticked: the $15 is taken back", !off.error && events(id).filter((e) => e.kind === "dec_sheet").reduce((s, e) => s + e.amount, 0) === 0, JSON.stringify(events(id)));
  }

  section("A manager's own appointment rate");
  {
    profile(MIKE, { appointment_rate: 40, confirmation_rate: null });
    const id = newLead(APPT, MIKE);
    sql(`insert into public.insurance_details (lead_id, ultimate_xdate) values (${id}, '2027-06-01')`);
    const tomorrow = sql("select ((now() at time zone public.business_tz())::date + 1)::text");
    const set = await mike.sb.rpc("record_call_result", { p_lead_id: id, p_result_id: RESULT["APPT:Appointment"], p_appointment: { date: tomorrow, time: "10:00 AM" }, p_ultimate_xdate: "2027-06-01" });
    check("David's deal: $40 an appointment on every project, not its $35", !set.error && events(id).some((e) => e.kind === "appointment" && e.amount === 40), set.error?.message ?? JSON.stringify(events(id)));
    sql(`update public.appointments set qa_status = 'passed' where lead_id = ${id}`);
    const conf = await mike.sb.rpc("record_call_result", { p_lead_id: id, p_result_id: RESULT["APPT:Appointment-Confirmed"] });
    check("…and the project's $5 confirmation", !conf.error && events(id).some((e) => e.kind === "confirmation" && e.amount === 5), conf.error?.message ?? JSON.stringify(events(id)));
  }

  section("Lead-Corrected");
  {
    const id = newLead(APPT, MIKE, `dbdv_user_id=${SEAN}`);
    sql(`update public.leads set source_project_id = ${DBDV} where id = ${id}`);
    sql(`insert into public.pay_events (user_id, project_id, lead_id, kind, amount) values (${SEAN}, ${DBDV}, ${id}, 'lead', 10)`);
    const fix = await mike.sb.rpc("record_call_result", { p_lead_id: id, p_result_id: RESULT["APPT:Lead-Corrected"], p_corrected_xdate: "2027-10-01" });
    const ev = events(id);
    check("the developer's $10 is charged back", !fix.error && ev.some((e) => e.user_id === SEAN && e.kind === "lead" && e.amount === -10), fix.error?.message ?? JSON.stringify(ev));
    check("…and paid to the appointment manager who corrected it", ev.some((e) => e.user_id === MIKE && e.kind === "corrected" && e.amount === 10), JSON.stringify(ev));
    check("…the lead manager told", Number(sql(`select count(*) from public.notifications where user_id = ${SEAN} and title like ${lit(`Lead corrected: ${TAG}%`)}`)) === 1);
    await mike.sb.rpc("record_call_result", { p_lead_id: id, p_result_id: RESULT["APPT:Lead-Corrected"], p_corrected_xdate: "2027-11-01" });
    check("corrected again: nothing more moves", events(id).length === ev.length, JSON.stringify(events(id)));

    const orphan = newLead(APPT, MIKE);
    const none = await mike.sb.rpc("record_call_result", { p_lead_id: orphan, p_result_id: RESULT["APPT:Lead-Corrected"], p_corrected_xdate: "2027-10-01" });
    check("no developer on record: the lead manager must be chosen", /Choose the lead manager/.test(none.error?.message ?? ""), none.error?.message);
    const named = await mike.sb.rpc("record_call_result", { p_lead_id: orphan, p_result_id: RESULT["APPT:Lead-Corrected"], p_corrected_xdate: "2027-10-01", p_lead_manager: SEAN });
    const ev2 = events(orphan);
    check("named: kept as its developer, charged the project's lead rate, paid to the corrector",
      !named.error && Number(sql(`select dbdv_user_id from public.leads where id = ${orphan}`)) === SEAN
        && ev2.some((e) => e.user_id === SEAN && e.amount === -12) && ev2.some((e) => e.user_id === MIKE && e.kind === "corrected" && e.amount === 12),
      named.error?.message ?? JSON.stringify(ev2));
    const notOurs = newLead(APPT, MIKE);
    const nobody = await mike.sb.rpc("record_call_result", { p_lead_id: notOurs, p_result_id: RESULT["APPT:Lead-Corrected"], p_corrected_xdate: "2027-10-01", p_lead_manager: 0 });
    check("a lead we didn't develop (nobody): corrected, no pay moves", !nobody.error && events(notOurs).length === 0, nobody.error?.message ?? JSON.stringify(events(notOurs)));
  }

  section("Special Pay requests");
  {
    const id = newLead(DBDV, SEAN);
    const bad = await sean.sb.rpc("request_special_pay", { p_lead_id: id, p_amount: 25, p_reason: " " });
    check("a reason is needed", /Say what/.test(bad.error?.message ?? ""));
    const asked = await sean.sb.rpc("request_special_pay", { p_lead_id: id, p_amount: 25, p_reason: "Owner meeting set across two locations" });
    const req = one(`select decider_id, status, amount::float as amount from public.special_pay_requests where id = ${asked.data}`);
    check("asked of the project's Sales Rep", !asked.error && req?.decider_id === RACHEL && req.status === "pending" && req.amount === 25, asked.error?.message ?? JSON.stringify(req));
    check("…who is told", Number(sql(`select count(*) from public.notifications where user_id = ${RACHEL} and title like 'Special Pay asked for: $25.00%'`)) >= 1);
    const self = await sean.sb.rpc("decide_special_pay", { p_request_id: asked.data, p_approve: true });
    check("the asker can't approve it", /Sales Rep or an administrator/.test(self.error?.message ?? ""), self.error?.message);
    const seen = await mike.sb.from("special_pay_requests").select("id").eq("id", asked.data);
    check("another manager doesn't see it", !seen.data?.length);
    const yes = await rachel.sb.rpc("decide_special_pay", { p_request_id: asked.data, p_approve: true, p_amount: 20, p_note: "Half the second location" });
    check("approved, adjusted to $20: paid in the period", !yes.error && events(id).some((e) => e.user_id === SEAN && e.kind === "request" && e.amount === 20), yes.error?.message ?? JSON.stringify(events(id)));
    check("…the manager told it was adjusted", Number(sql(`select count(*) from public.notifications where user_id = ${SEAN} and title = ${lit(`Special Pay approved: $20.00 · ${TAG} Co ${n}`)} and body like 'Adjusted from $25.00%'`)) === 1);
    const twice = await rachel.sb.rpc("decide_special_pay", { p_request_id: asked.data, p_approve: false });
    check("decided once", /already been decided/.test(twice.error?.message ?? ""));
    const no = await sean.sb.rpc("request_special_pay", { p_lead_id: id, p_amount: 50, p_reason: "Again" });
    await rachel.sb.rpc("decide_special_pay", { p_request_id: no.data, p_approve: false, p_note: "Not this time" });
    check("declined: nothing paid", events(id).filter((e) => e.kind === "request").length === 1 && one(`select status from public.special_pay_requests where id = ${no.data}`)?.status === "declined");
  }

  section("A lead manager's units bonus");
  {
    setPlans({ lead_weekly: [{ at: 50, amount: 50 }, { at: 75, amount: 75 }], appt_weekly: [{ at: 3, amount: 40 }], appt_monthly: [{ at: 3, amount: 300 }, { at: 4, amount: 500 }] });
    profile(SEAN, { bonus_plan: "lead" });
    const before = one(`select coalesce(sum(public.bonus_units(${SEAN}, h.s, h.e)), 0)::float as u from (select case when ${lit(today)}::date < p.starts_on + 5 then p.starts_on else p.starts_on + 5 end as s,
      case when ${lit(today)}::date < p.starts_on + 5 then least(p.starts_on + 4, p.ends_on) else p.ends_on end as e from public.pay_period_of(${lit(today)}::date) p) h`)?.u ?? 0;
    // Units to just under 50 today (leads 1, appointments 2), then a dec sheet over it.
    const need = Math.max(0, 49 - before);
    const holder = newLead(DBDV, SEAN);
    for (let i = 0; i < Math.floor(need / 2); i += 1) sql(`insert into public.pay_events (user_id, project_id, lead_id, kind, amount) values (${SEAN}, ${DBDV}, ${holder}, 'appointment', 0)`);
    if (need % 2) sql(`insert into public.pay_events (user_id, project_id, lead_id, kind, amount) values (${SEAN}, ${DBDV}, ${holder}, 'lead', 0)`);
    const congrats = () => Number(sql(`select count(*) from public.notifications where user_id = ${SEAN} and title like 'Congrats! You hit your%' and created_at > now() - interval '5 minutes'`));
    const was = congrats();
    const decLead = newLead(DBDV, SEAN);
    attach(decLead);
    await sean.sb.rpc("set_dec_sheet", { p_lead_id: decLead, p_on: true });
    check("the dec sheet that makes 50 units: congratulated", congrats() === was + 1, `${was} → ${congrats()}`);
    const period = one(`select starts_on::text as s, ends_on::text as e from public.pay_period_of(${lit(today)}::date)`);
    const bonus = all(`select plan, counted::float as counted, amount::float as amount, paid_to::text from public.pay_bonuses(${lit(period.s)}, ${lit(period.e)}, ${SEAN})`);
    check("$50 in this period's pay", bonus.some((b) => b.plan === "lead" && b.amount === 50 && b.counted >= 50 && b.paid_to === period.e), JSON.stringify(bonus));
    for (let i = 0; i < 13; i += 1) sql(`insert into public.pay_events (user_id, project_id, lead_id, kind, amount) values (${SEAN}, ${DBDV}, ${holder}, 'appointment', 0)`);
    await sean.sb.rpc("set_dec_sheet", { p_lead_id: decLead, p_on: false });
    await sean.sb.rpc("set_dec_sheet", { p_lead_id: decLead, p_on: true });
    const after = all(`select amount::float as amount from public.pay_bonuses(${lit(period.s)}, ${lit(period.e)}, ${SEAN}) where plan = 'lead'`);
    check("75 units in a half: $75 (not 50 + 75)", after.some((b) => b.amount === 75), JSON.stringify(after));
    check("…congratulated again, once for each tier", congrats() === was + 2, `${congrats()}`);
    const report = await admin.sb.rpc("pay_report", { p_from: period.s, p_to: period.e, p_user: SEAN });
    const row = report.data?.[0];
    check("the pay report: the bonus, on top of the pay", !report.error && Number(row?.bonus) >= 75 && row?.bonus_plan === "lead"
      && Math.abs(Number(row.pay) - (Number(row.commission) + Number(row.bonus)) - (row.pay_model === "hybrid" ? Math.max(0, Number(row.hourly_pay) - Number(row.commission)) : 0)) < 0.01,
      report.error?.message ?? JSON.stringify(row));
    check("…its dec sheets, corrections and Special Pay too", Number(row?.dec_sheets) >= 1 && Number(row?.request_pay) >= 20, JSON.stringify(row));
  }

  section("An appointment manager's week, paid the period after");
  {
    profile(RACHEL, { bonus_plan: "appointment" });
    const last = one(`select p.starts_on::text as s, p.ends_on::text as e, n.starts_on::text as ns, n.ends_on::text as ne
      from public.pay_period_of((select starts_on - 1 from public.pay_period_of(${lit(today)}::date))) p, public.pay_period_of(${lit(today)}::date) n`);
    const id = newLead(APPT, RACHEL);
    const appts = [0, 1, 2, 3].map(() => Number(sql(`insert into public.appointments (lead_id, user_id, project_id, appt_date, appt_time, qa_status, created_at)
      values (${id}, ${RACHEL}, ${APPT}, ${lit(last.s)}::date + 20, '10:00 AM', 'passed', (${lit(last.s)}::date + interval '10 hours') at time zone public.business_tz()) returning id`)));
    const weekly = () => all(`select amount::float as amount, counted::float as counted, from_day::text, paid_to::text from public.pay_bonuses(${lit(last.ns)}, ${lit(last.ne)}, ${RACHEL}) where plan = 'appt_weekly'`);
    check("4 valid set in the first half of last period: $40 on this period's pay", weekly().some((b) => b.amount === 40 && b.counted === 4 && b.from_day === last.s && b.paid_to === last.ne), JSON.stringify(weekly()));
    check("…not on last period's", !all(`select 1 from public.pay_bonuses(${lit(last.s)}, ${lit(last.e)}, ${RACHEL}) where plan = 'appt_weekly'`).length);
    sql(`update public.appointments set invalid_at = now() where id in (${appts[0]}, ${appts[1]})`);
    check("two found invalid since: 2 valid, under the tier, no bonus", !weekly().length, JSON.stringify(weekly()));
    sql(`delete from public.appointments where lead_id = ${id}`);
  }

  section("An appointment manager's month");
  {
    // Four valid set last month, their dates passed: the $300 tier at the third, the $500 at the fourth ($200 more).
    const month = sql(`select (date_trunc('month', (now() at time zone public.business_tz())::date) - interval '1 month')::date::text`);
    const id = newLead(APPT, RACHEL);
    [3, 4, 5, 6].forEach((d) => sql(`insert into public.appointments (lead_id, user_id, project_id, appt_date, appt_time, qa_status, created_at)
      values (${id}, ${RACHEL}, ${APPT}, ${lit(month)}::date + ${d}, '10:00 AM', 'passed', (${lit(month)}::date + 1 + interval '10 hours') at time zone public.business_tz())`));
    const rows = all(`select amount::float as amount, counted::float as counted, label from public.pay_bonuses(${lit(month)}, ${lit(today)}, ${RACHEL}) where plan = 'appt_monthly'`);
    check("both tiers, paid once the month is over: $300 then $200 more (a $500 bonus)", rows.length === 2 && rows[0].amount + rows[1].amount === 500 && rows.some((r) => r.amount === 300), JSON.stringify(rows));
    sql(`update public.appointments set appt_date = (now() at time zone public.business_tz())::date + 30 where id = (select max(id) from public.appointments where lead_id = ${id})`);
    const later = all(`select amount::float as amount from public.pay_bonuses(${lit(month)}, ${lit(today)}, ${RACHEL}) where plan = 'appt_monthly'`);
    check("the fourth's date not passed yet: only the first tier so far", later.length === 1 && later[0].amount === 300, JSON.stringify(later));
    sql(`delete from public.appointments where lead_id = ${id}`);
  }
} finally {
  sql(plansBefore ? `insert into public.app_settings (key, value) values ('bonus_plans', ${lit(plansBefore)}::jsonb) on conflict (key) do update set value = excluded.value`
    : "delete from public.app_settings where key = 'bonus_plans'");
  sql(`delete from public.pay_profiles where user_id in (${SEAN}, ${MIKE}, ${RACHEL})`);
  for (const p of profiles) profile(p.user_id, Object.fromEntries(Object.entries(p).filter(([k]) => k !== "user_id")));
  sql(`delete from public.bonus_notices where user_id in (${SEAN}, ${MIKE}, ${RACHEL}) and created_at > now() - interval '1 hour'`);
  sql(`delete from public.notifications where (title like ${lit(`%${TAG}%`)} or title like 'Congrats! You hit your%' or title like 'Special Pay%') and created_at > now() - interval '1 hour'`);
  sql(`delete from public.special_pay_requests where project_id in (${DBDV}, ${APPT})`);
  sql(`delete from public.pay_events where project_id in (${DBDV}, ${APPT}) or lead_id in (select id from public.leads where project_id in (${DBDV}, ${APPT}))`);
  sql(`delete from public.appointments where lead_id in (select id from public.leads where project_id in (${DBDV}, ${APPT}))`);
  sql(`delete from public.call_records where lead_id in (select id from public.leads where project_id in (${DBDV}, ${APPT}))`);
  sql(`delete from public.documents where storage_path like ${lit(`test/${TAG}/%`)}`);
  sql(`delete from public.activity_log where entity = 'lead' and entity_id in (select id from public.leads where project_id in (${DBDV}, ${APPT}))`);
  sql(`delete from public.leads where project_id in (${DBDV}, ${APPT})`);
  sql(`delete from public.project_assignments where project_id in (${DBDV}, ${APPT})`);
  sql(`delete from public.projects where id in (${DBDV}, ${APPT})`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("pay extras");
