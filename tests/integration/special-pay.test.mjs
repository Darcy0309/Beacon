/**
 * Special Pay on DB dev leads (Sean, Oct 2026): an administrator sets a DB dev
 * project's goal (leads a pay period) and Special Pay a lead; once a rep's
 * leads there that pay period reach it, each of them, and each after, is
 * paid it, and the rep is told once. Leads from another period never count;
 * a lead charged back takes its Special Pay back. The reports carry it as
 * Special Pay, and confirmation pay by its own name. pay_period_of() agrees
 * with the app's payPeriod() for every kind of pay period.
 *
 * Every result is recorded as a real rep through record_call_result().
 *
 *   npm run test:integration
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";
import { payPeriod } from "../../src/lib/pay.js";

const TAG = `SP-TEST ${Date.now()}`;
const one = (query) => JSON.parse(sql(`select coalesce(row_to_json(t), 'null') from (${query}) t`));
const all = (query) => JSON.parse(sql(`select coalesce(json_agg(t), '[]') from (${query}) t`));
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const SEAN = userId("sean@beacon.test");
const RACHEL = userId("rachel@beacon.test");
const MIKE = userId("mike@beacon.test");
const RESULT = Object.fromEntries(all("select id, project_type, name from public.call_results").map((r) => [`${r.project_type}:${r.name}`, r.id]));
const typeId = (code) => sql(`select id from public.project_types where code=${lit(code)}`);

const companyId = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appointment_rate, confirmation_rate)
  values (${lit(`${TAG} Appointments`)}, ${companyId}, ${typeId("APPT")}, 1, 40, 10) returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id, lead_rate)
  values (${lit(`${TAG} DBDev`)}, ${companyId}, ${typeId("DBDV")}, 1, ${APPT}, 8) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${DBDV}, ${SEAN}), (${DBDV}, ${RACHEL}), (${APPT}, ${MIKE})`);

let n = 0;
const newName = (rep) => {
  n += 1;
  return Number(sql(`insert into public.leads (company_name, project_id, assigned_user_id) values (${lit(`${TAG} Co ${n}`)}, ${DBDV}, ${rep}) returning id`));
};
async function record(who, leadId, type, name) {
  const { data, error } = await who.sb.rpc("record_call_result", {
    p_lead_id: leadId, p_result_id: RESULT[`${type}:${name}`], p_notes: null, p_appointment: null, p_corrected_xdate: null,
    p_ultimate_xdate: type === "DBDV" ? "2027-03-01" : null,
  });
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}
const specials = (user) => all(`select lead_id, amount::float as amount, reverses_id is not null as back from public.pay_events
  where kind='special' and user_id=${user} and project_id=${DBDV} order by id`);
const told = (user) => Number(sql(`select count(*) from public.notifications where user_id=${user} and title like ${lit(`Special Pay: you hit % leads on ${TAG} DBDev`)}`));
const today = sql("select (now() at time zone public.business_tz())::date");
const period = one(`select * from public.pay_period_of('${today}')`);

const admin = await signIn("admin@beacon.test");
const sean = await signIn("sean@beacon.test");
const rachel = await signIn("rachel@beacon.test");
const mike = await signIn("mike@beacon.test");
const savedTime = sql("select coalesce((select value::text from public.app_settings where key='time_tracking'), '')");

try {
  section("Set by an administrator, on a DB dev project");
  const bySean = await sean.sb.rpc("set_project_special_pay", { p_project_id: DBDV, p_goal: 3, p_rate: 1 });
  check("a manager cannot set it", /administrator/i.test(bySean.error?.message ?? ""), bySean.error?.message);
  await sean.sb.from("projects").update({ special_goal: 3, special_rate: 1 }).eq("id", DBDV);
  check("…nor write it straight to the project", one(`select special_goal from public.projects where id=${DBDV}`).special_goal === null);
  const onAppt = await admin.sb.rpc("set_project_special_pay", { p_project_id: APPT, p_goal: 3, p_rate: 1 });
  check("not on an appointment project", /DB dev projects/.test(onAppt.error?.message ?? ""), onAppt.error?.message);
  const half = await admin.sb.rpc("set_project_special_pay", { p_project_id: DBDV, p_goal: 3, p_rate: 0 });
  check("a goal needs an amount", /both a goal and an amount/.test(half.error?.message ?? ""), half.error?.message);
  const set = await admin.sb.rpc("set_project_special_pay", { p_project_id: DBDV, p_goal: 3, p_rate: 1 });
  check("an administrator sets 3 leads a pay period, $1 a lead", !set.error && set.data?.special_goal === 3 && Number(set.data?.special_rate) === 1, set.error?.message);

  section("Paid once the goal is hit");
  const leads = [];
  for (let i = 0; i < 2; i += 1) {
    leads.push(newName(SEAN));
    await record(sean, leads.at(-1), "DBDV", "Lead");
  }
  check("two leads: lead pay only, nothing more yet", specials(SEAN).length === 0 && told(SEAN) === 0, JSON.stringify(specials(SEAN)));
  leads.push(newName(SEAN));
  await record(sean, leads.at(-1), "DBDV", "Lead");
  const hit = specials(SEAN);
  check("the third: $1 Special Pay on each of the three", hit.length === 3 && hit.every((s) => s.amount === 1 && !s.back)
    && leads.every((id) => hit.some((s) => s.lead_id === id)), JSON.stringify(hit));
  check("…and Sean is told, once", told(SEAN) === 1);
  const note = one(`select body, link from public.notifications where user_id=${SEAN} and title like ${lit(`Special Pay:%${TAG} DBDev`)}`);
  check("…what it comes to, and where to see it", /\$1\.00 more for each of your 3 leads/.test(note?.body ?? "") && /\$3\.00 so far/.test(note.body) && note.link === "/reports/pay", note?.body);
  leads.push(newName(SEAN));
  await record(sean, leads.at(-1), "DBDV", "Lead");
  check("a fourth that period: its own $1, no second message", specials(SEAN).length === 4 && told(SEAN) === 1, JSON.stringify(specials(SEAN)));

  section("Only this pay period's leads count");
  // Two of Rachel's leads in the period before this one, then two in it: two, short of three.
  const before = sql(`select '${period.starts_on}'::date - 1`);
  for (let i = 0; i < 2; i += 1) {
    const id = newName(RACHEL);
    sql(`insert into public.pay_events (user_id, project_id, lead_id, kind, amount, created_at)
      values (${RACHEL}, ${DBDV}, ${id}, 'lead', 8, ('${before}'::date + time '12:00') at time zone public.business_tz())`);
  }
  for (let i = 0; i < 2; i += 1) await record(rachel, newName(RACHEL), "DBDV", "Lead");
  check("two last period and two in this one: no Special Pay", specials(RACHEL).length === 0 && told(RACHEL) === 0, JSON.stringify(specials(RACHEL)));

  section("On the pay summary and the production report");
  // As the administrator: pay_report() answers whoever is signed in.
  const payOf = async (user) => {
    const { data, error } = await admin.sb.rpc("pay_report", { p_from: period.starts_on, p_to: period.ends_on, p_user: user });
    if (error) throw error;
    const r = data[0];
    return { specials: Number(r.specials), special: Number(r.special_goal_pay), commission: Number(r.commission) };
  };
  const mine = await payOf(SEAN);
  check("pay summary: 4 leads, $4 Special Pay, in the commission ($32 + $4)", mine.specials === 4 && mine.special === 4 && mine.commission === 36, JSON.stringify(mine));
  const asSean = await sean.sb.rpc("pay_report", { p_from: period.starts_on, p_to: period.ends_on });
  check("…Sean reads his own", !asSean.error && asSean.data?.length === 1 && Number(asSean.data[0].special_goal_pay) === 4, asSean.error?.message);
  const prod = await admin.sb.rpc("production_report", { p_from: period.starts_on, p_to: period.ends_on, p_project_id: DBDV, p_user_id: SEAN });
  const p = (prod.data ?? []).reduce((a, r) => ({ lead: a.lead + Number(r.lead_pay), special: a.special + Number(r.special_goal_pay), specials: a.specials + Number(r.specials),
    confirm: a.confirm + Number(r.confirmation_pay), amount: a.amount + Number(r.amount) }), { lead: 0, special: 0, specials: 0, confirm: 0, amount: 0 });
  check("production report: lead pay $32, Special Pay $4 on 4, total $36", !prod.error && p.lead === 32 && p.special === 4 && p.specials === 4 && p.confirm === 0 && p.amount === 36, prod.error?.message ?? JSON.stringify(p));

  section("A lead charged back takes its Special Pay back");
  const invalid = leads[0];
  const holder = Number(sql(`select assigned_user_id from public.leads where id=${invalid}`));
  check("the lead was promoted to the appointment project, to Mike", holder === MIKE, String(holder));
  await record(mike, invalid, "APPT", "Lead-Invalid");
  const back = all(`select kind, amount::float as amount from public.pay_events where lead_id=${invalid} and reverses_id is not null order by kind`);
  check("Lead-Invalid: its $8 and its $1 charged back", back.length === 2 && back.some((b) => b.kind === "lead" && b.amount === -8) && back.some((b) => b.kind === "special" && b.amount === -1), JSON.stringify(back));
  const after = await payOf(SEAN);
  check("…the pay summary: 3 leads, $3", after.specials === 3 && after.special === 3, JSON.stringify(after));
  leads.push(newName(SEAN));
  await record(sean, leads.at(-1), "DBDV", "Lead");
  const next = specials(SEAN).filter((s) => !s.back);
  check("still at the goal (3 left after it): the next lead pays $1 too, and the charged-back one is not paid again",
    next.length === 5 && next.filter((s) => s.lead_id === invalid).length === 1 && next.some((s) => s.lead_id === leads.at(-1)), JSON.stringify(next));

  section("The pay period, as the app works it out");
  const days = ["2026-10-22", "2026-10-04", "2026-10-05", "2026-10-18", "2026-12-31", "2027-01-01", "2027-02-15", "2027-02-16", "2028-02-29", "2025-03-03"];
  const same = (time) => days.filter((d) => {
    const s = one(`select starts_on as from, ends_on as to from public.pay_period_of('${d}')`);
    const j = payPeriod(d, time);
    return s.from !== j.from || s.to !== j.to;
  });
  const setTime = (time) => sql(`insert into public.app_settings (key, value) values ('time_tracking', ${lit(JSON.stringify(time))}::jsonb)
    on conflict (key) do update set value = excluded.value`);
  for (const time of [
    {},
    { pay_period: "weekly", period_start: "2026-10-07" },
    { pay_period: "biweekly", period_start: "2026-09-28" },
    { pay_period: "biweekly", period_start: "not a date" },
    { pay_period: "semimonthly" },
    { pay_period: "monthly" },
    { pay_period: "custom" },
  ]) {
    setTime(time);
    const off = same({ pay_period: "weekly", period_start: "2026-10-05", ...time, schedule: [] });
    check(`${time.pay_period ?? "the default"}${time.period_start ? ` from ${time.period_start}` : ""}${time.pay_period === "custom" ? " with no periods yet (two weeks)" : ""}: the same periods`, off.length === 0, off.join(", "));
  }
  // The business's own schedule: in a period, between two, after the last, before the first.
  setTime({ pay_period: "custom" });
  const ids = sql(`with ins as (insert into public.pay_periods (starts_on, ends_on) values ('2031-03-01', '2031-03-14'), ('2031-03-20', '2031-04-02') returning id)
    select string_agg(id::text, ',') from ins`);
  try {
    const schedule = all("select starts_on as from, ends_on as to from public.pay_periods order by starts_on");
    const custom = ["2031-03-05", "2031-03-16", "2031-04-20", "2031-02-01", "2031-03-20"].filter((d) => {
      const s = one(`select starts_on as from, ends_on as to from public.pay_period_of('${d}')`);
      const j = payPeriod(d, { pay_period: "custom", schedule });
      return s.from !== j.from || s.to !== j.to;
    });
    check("its own schedule: in a period, between two, after the last, before the first", custom.length === 0, custom.join(", "));
  } finally {
    sql(`delete from public.pay_periods where id in (${ids})`);
  }
} finally {
  if (savedTime) sql(`update public.app_settings set value=${lit(savedTime)}::jsonb where key='time_tracking'`);
  else sql("delete from public.app_settings where key='time_tracking'");
  const like = lit(`${TAG}%`);
  sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)} or body like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.pay_events where project_id in (${DBDV}, ${APPT})`);
  sql(`delete from public.appointments where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.call_records where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.insurance_details where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.leads where company_name like ${like}`);
  sql(`delete from public.project_assignments where project_id in (${DBDV}, ${APPT})`);
  sql(`update public.projects set appt_project_id = null where id = ${DBDV}`);
  sql(`delete from public.projects where id in (${DBDV}, ${APPT})`);
  sql(`delete from public.companies where id = ${companyId}`);
}

finish("special pay");
