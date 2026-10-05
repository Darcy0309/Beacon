/**
 * Pay rates, hybrid pay and time worked, against the database as real
 * signed-in users: project rates stay inside the ranges in Settings; each
 * account manager's pay is set by an administrator and seen by them; time
 * worked counts actions in the app with the client's rules (the timer stops
 * after 5 idle minutes, a call counts until its result is saved, each hour
 * rounds up to 15 minutes), and nobody can write or backdate it; hybrid pay
 * is the higher of the hourly pay and the commission; and the production
 * report names each event's client and splits the pay by kind.
 *
 * Runs on its own test client and removes everything it made.
 *
 *   npm run test:integration
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `PAY-TEST ${Date.now()}`;
const STARTED = sql("select now()");
const DAY = "2025-03-12"; // a quiet day in the past, in the business's time zone (Phoenix)
const all = (query) => JSON.parse(sql(`select coalesce(json_agg(t), '[]') from (${query}) t`));
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const RACHEL = userId("rachel@beacon.test");
const SEAN = userId("sean@beacon.test");
const at = (time) => `(timestamp ${lit(`${DAY} ${time}`)} at time zone 'America/Phoenix')`;

const companyId = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const projectId = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, lead_rate, appointment_rate, confirmation_rate)
  values (${lit(`${TAG} DBDev`)}, ${companyId}, (select id from public.project_types where code='DBDV'), 1, 15, 0, 0) returning id`));
const leadId = Number(sql(`insert into public.leads (company_name, project_id) values (${lit(`${TAG} Co`)}, ${projectId}) returning id`));

const admin = await signIn("admin@beacon.test");
const rachel = await signIn("rachel@beacon.test");
const sean = await signIn("sean@beacon.test");

const setRates = (who, lead, appointment, confirmation) =>
  who.sb.rpc("set_project_rates", { p_project_id: projectId, p_lead: lead, p_appointment: appointment, p_confirmation: confirmation });
const days = async (who, uid) => (await who.sb.rpc("work_days", { p_from: DAY, p_to: DAY, p_user: uid })).data ?? [];
const setTime = (rules) => sql(`insert into public.app_settings (key, value) values ('time_tracking', ${lit(JSON.stringify(rules))}::jsonb)
  on conflict (key) do update set value = excluded.value`);

try {
  section("The rules, with the client's numbers until an administrator changes them");
  {
    const { data, error } = await sean.sb.rpc("pay_rules");
    check("account managers can read them", !error, error?.message);
    check("lead $8–$12, appointment $30–$50, special pay $5–$20, hourly $15.15–$25",
      data?.rates?.lead?.min === 8 && data.rates.lead.max === 12 && data.rates.appointment.min === 30 && data.rates.appointment.max === 50
      && data.rates.special.min === 5 && data.rates.special.max === 20 && data.rates.hourly.min === 15.15 && data.rates.hourly.max === 25,
      JSON.stringify(data?.rates));
    check("stop after 5 idle minutes, round each hour up to 15, a call counts up to 30",
      data?.time?.idle_minutes === 5 && data.time.rounding === "hour_up" && data.time.round_to === 15 && data.time.call_minutes === 30,
      JSON.stringify(data?.time));
  }

  section("Project rates inside their ranges");
  {
    const high = await setRates(admin, 13, 0, 0);
    check("a lead rate above the range is refused, saying the range", /Lead pay must be between \$8\.00 and \$12\.00/.test(high.error?.message ?? ""), high.error?.message);
    const low = await setRates(admin, 15, 30, 4);
    check("special pay below its range is refused", /Special pay must be between \$5\.00 and \$20\.00/.test(low.error?.message ?? ""), low.error?.message);
    const kept = await setRates(admin, 15, 31, 0);
    check("a rate left as it was is kept, even outside the range ($15 lead)", !kept.error && Number(kept.data?.lead_rate) === 15, kept.error?.message);
    const zero = await setRates(admin, 0, 31, 0);
    check("$0 is always allowed: not paid on this project", !zero.error && Number(zero.data?.lead_rate) === 0, zero.error?.message);
    const ok = await setRates(admin, 9.5, 50, 20);
    check("inside the ranges, saved", !ok.error && Number(ok.data?.lead_rate) === 9.5 && Number(ok.data?.confirmation_rate) === 20, ok.error?.message);
    sql(`insert into public.app_settings (key, value) values ('pay_rates', '{"lead": {"min": 8, "max": 15, "step": 0.5}}'::jsonb)
      on conflict (key) do update set value = excluded.value`);
    const wider = await setRates(admin, 13, 50, 20);
    check("widening a range in Settings allows more, with no other change", !wider.error && Number(wider.data?.lead_rate) === 13, wider.error?.message);
    sql("delete from public.app_settings where key = 'pay_rates'");
  }

  section("How each account manager is paid");
  {
    const set = await admin.sb.from("pay_profiles").upsert({ user_id: RACHEL, pay_model: "hybrid", hourly_rate: 16 }).select("pay_model, hourly_rate").single();
    check("an administrator sets Rachel to hybrid at $16/hr", !set.error && set.data?.pay_model === "hybrid" && Number(set.data.hourly_rate) === 16, set.error?.message);
    const tooHigh = await admin.sb.from("pay_profiles").update({ hourly_rate: 30 }).eq("user_id", RACHEL);
    check("an hourly rate outside $15.15–$25 is refused", /between \$15\.15 and \$25\.00/.test(tooHigh.error?.message ?? ""), tooHigh.error?.message);
    const noRate = await admin.sb.from("pay_profiles").upsert({ user_id: SEAN, pay_model: "hybrid", hourly_rate: null });
    check("hybrid needs an hourly rate", Boolean(noRate.error), "saved without a rate");
    const own = await rachel.sb.from("pay_profiles").select("pay_model, hourly_rate");
    check("Rachel sees her own pay", !own.error && own.data?.length === 1 && own.data[0].pay_model === "hybrid", JSON.stringify(own.data));
    const others = await sean.sb.from("pay_profiles").select("user_id").eq("user_id", RACHEL);
    check("Sean does not see Rachel's", (others.data ?? []).length === 0, JSON.stringify(others.data));
    const raise = await rachel.sb.from("pay_profiles").update({ hourly_rate: 25 }).eq("user_id", RACHEL).select("user_id");
    check("Rachel cannot change her own rate", (raise.data ?? []).length === 0 && Number(sql(`select hourly_rate from public.pay_profiles where user_id=${RACHEL}`)) === 16,
      raise.error?.message ?? JSON.stringify(raise.data));
  }

  section("Time worked: written only by the server, at the server's time");
  {
    const first = await rachel.sb.rpc("track_activity", { p_kind: "use" });
    const again = await rachel.sb.rpc("track_activity", { p_kind: "use" });
    check("Rachel's actions are recorded", !first.error && !again.error, first.error?.message ?? again.error?.message);
    const rows = all(`select minute, kind from public.work_activity where user_id=${RACHEL} and at >= ${lit(STARTED)}`);
    check("one row a minute, however many actions", rows.filter((r) => r.kind === "use").length === 1, JSON.stringify(rows));
    const call = await rachel.sb.rpc("track_activity", { p_kind: "call", p_lead: leadId });
    check("pressing Call now records the call and the name", !call.error && Number(sql(`select count(*) from public.work_activity where user_id=${RACHEL} and kind='call' and lead_id=${leadId} and at >= ${lit(STARTED)}`)) === 1,
      call.error?.message);
    const forged = await rachel.sb.from("work_activity").insert({ user_id: RACHEL, minute: "2025-01-01T15:00:00Z", kind: "use" });
    check("nobody can write time worked directly", Boolean(forged.error), "insert allowed");
    const peek = await sean.sb.from("work_activity").select("id").eq("user_id", RACHEL);
    check("nor see someone else's", (peek.data ?? []).length === 0, JSON.stringify(peek.data));
    const backdated = await rachel.sb.from("call_records").insert({ lead_id: leadId, project_id: projectId, user_id: SEAN, call_date: "2025-01-01T15:00:00Z", call_result: TAG }).select("user_id, call_date").single();
    check("a call written directly is stamped with the caller and now", !backdated.error && backdated.data?.user_id === RACHEL && !backdated.data.call_date.startsWith("2025-01-01"),
      backdated.error?.message ?? JSON.stringify(backdated.data));
    const moved = await rachel.sb.from("call_records").update({ call_date: "2025-01-01T15:00:00Z" }).eq("call_result", TAG);
    check("and cannot be moved to another time", Boolean(moved.error), "update allowed");
  }

  // The client's example and the edges around it, on a quiet day in the past.
  sql(`insert into public.work_activity (user_id, minute, at, kind)
    select ${RACHEL}, m, m, 'use' from generate_series(${at("08:00")}, ${at("08:14")}, interval '1 minute') m
    union all select ${RACHEL}, m, m, 'use' from generate_series(${at("08:45")}, ${at("08:59")}, interval '1 minute') m
    union all select ${RACHEL}, m, m, 'use' from unnest(array[${at("10:20")}, ${at("13:00")}, ${at("13:05")}, ${at("14:00")}, ${at("14:06")}]) m`);
  sql(`insert into public.work_activity (user_id, minute, at, kind, lead_id) values (${RACHEL}, ${at("11:00")}, ${at("11:00:20")}, 'call', ${leadId})`);
  sql(`insert into public.call_records (lead_id, project_id, user_id, call_date, call_result) values (${leadId}, ${projectId}, ${RACHEL}, ${at("11:12:30")}, ${lit(TAG)})`);

  section("Counting time worked (the client's rules)");
  {
    const [d] = await days(admin, RACHEL);
    const hour = (h) => d?.hours?.find((x) => x.hour === h) ?? {};
    check("8:00–8:15 and 8:45–9:00 is 30 minutes for that hour", hour(8).minutes === 30, JSON.stringify(hour(8)));
    check("one click in an hour is 1 minute worked, 15 paid", hour(10).minutes === 1 && hour(10).paid === 15, JSON.stringify(hour(10)));
    check("a call from Call now (11:00) to its result (11:12) counts as work: 13 minutes", hour(11).minutes === 13, JSON.stringify(hour(11)));
    check("two actions 5 minutes apart: the time between counts (6 minutes)", hour(13).minutes === 6, JSON.stringify(hour(13)));
    check("6 minutes apart: the timer had stopped (2 minutes)", hour(14).minutes === 2, JSON.stringify(hour(14)));
    check("the day: 52 minutes worked, 90 paid (each hour rounded up to 15)", d?.worked === 52 && d.paid === 90, `${d?.worked} / ${d?.paid}`);

    setTime({ rounding: "day_up" });
    check("rounding the day up instead: 60 paid", (await days(admin, RACHEL))[0]?.paid === 60);
    setTime({ rounding: "day_nearest" });
    check("to the nearest 15: 45 paid", (await days(admin, RACHEL))[0]?.paid === 45);
    setTime({ rounding: "none" });
    check("no rounding: 52 paid", (await days(admin, RACHEL))[0]?.paid === 52);
    setTime({ idle_minutes: 10 });
    const idle = (await days(admin, RACHEL))[0]?.hours?.find((x) => x.hour === 14);
    check("a 10-minute idle limit bridges the 6-minute gap", idle?.minutes === 7, JSON.stringify(idle));
    setTime({ call_minutes: 0 });
    const noCall = (await days(admin, RACHEL))[0]?.hours?.find((x) => x.hour === 11);
    check("with call time off, only the two clicks count", noCall?.minutes === 2, JSON.stringify(noCall));
    sql("delete from public.app_settings where key = 'time_tracking'");

    const mine = await days(rachel, SEAN);
    check("Rachel asking for Sean's days gets her own", mine.every((x) => x.user_id === RACHEL) && mine.length === 1, JSON.stringify(mine.map((x) => x.user_id)));
  }

  section("Hybrid pay: the higher of hourly and commission");
  {
    sql(`insert into public.pay_events (user_id, project_id, lead_id, kind, amount, note, created_at)
      values (${RACHEL}, ${projectId}, ${leadId}, 'lead', 40, ${lit(TAG)}, ${at("09:00")})`);
    const report = async (who, uid = null) => (await who.sb.rpc("pay_report", { p_from: DAY, p_to: DAY, p_user: uid })).data ?? [];
    let row = (await report(admin)).find((r) => r.user_id === RACHEL);
    check("1.5 paid hours at $16 is $24 of hourly pay", Number(row?.hourly_pay) === 24 && row.paid_minutes === 90, JSON.stringify(row));
    check("commission $40 is higher, so $40 is due", Number(row?.commission) === 40 && Number(row.pay) === 40, JSON.stringify(row));
    sql(`insert into public.pay_events (user_id, project_id, lead_id, kind, amount, note, created_at)
      values (${RACHEL}, ${projectId}, ${leadId}, 'lead', -30, ${lit(`${TAG} chargeback`)}, ${at("16:00")})`);
    row = (await report(admin)).find((r) => r.user_id === RACHEL);
    check("after a $30 chargeback the commission is $10, so the hourly $24 is due", Number(row?.commission) === 10 && Number(row.pay) === 24 && Number(row.chargebacks) === 1,
      JSON.stringify(row));
    const seanRow = (await report(admin)).find((r) => r.user_id === SEAN);
    check("an account manager on commission only is listed, paid their commission", seanRow?.pay_model === "commission" && Number(seanRow.pay) === Number(seanRow.commission),
      JSON.stringify(seanRow));
    const hers = await report(rachel, SEAN);
    check("Rachel sees only her own pay, whatever she asks for", hers.length === 1 && hers[0].user_id === RACHEL, JSON.stringify(hers.map((r) => r.user_id)));
  }

  section("The production report names the client and splits the pay");
  {
    const { data, error } = await admin.sb.rpc("production_report", { p_from: DAY, p_to: DAY, p_project_id: projectId });
    const row = (data ?? []).find((r) => r.user_id === RACHEL);
    check("each row names the client", !error && row?.client === `${TAG} Insurance`, error?.message ?? JSON.stringify(row));
    check("lead pay and chargebacks apart, and the total", Number(row?.lead_pay) === 40 && Number(row.chargeback_amount) === -30 && Number(row.amount) === 10,
      JSON.stringify(row));
  }
} finally {
  sql("delete from public.app_settings where key in ('pay_rates', 'time_tracking')");
  sql(`delete from public.pay_profiles where user_id in (${RACHEL}, ${SEAN})`);
  sql(`delete from public.work_activity where user_id in (${RACHEL}, ${SEAN}) and (at >= ${lit(STARTED)} or minute::date between ${lit(DAY)}::date - 1 and ${lit(DAY)}::date + 1)`);
  sql(`delete from public.pay_events where project_id = ${projectId}`);
  sql(`delete from public.call_records where lead_id = ${leadId} or call_result = ${lit(TAG)}`);
  sql(`delete from public.leads where id = ${leadId}`);
  sql(`delete from public.projects where id = ${projectId}`);
  sql(`delete from public.companies where id = ${companyId}`);
}

finish("pay and time");
