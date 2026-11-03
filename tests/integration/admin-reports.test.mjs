/**
 * The administrators' Reports (Sean, Nov 2026): report_counts() by month,
 * project and manager; billing_report() for each active client's project, a
 * Sales Rep's alone when asked, with the names called and the managers' pay
 * as its cost; and report_items(), the names behind each figure. Leads count
 * when developed, appointments when set; invalid ones apart. Administrators only.
 *
 * Removes everything it made.
 *
 *   node tests/integration/admin-reports.test.mjs
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `AR-TEST ${Date.now()}`;
const SEAN = 2, MIKE = 3, RACHEL = 4;
// The business's month and day, as the reports count them.
const [from, today, lastMonth] = sql(`select concat_ws('|', date_trunc('month', (now() at time zone public.business_tz()))::date,
  (now() at time zone public.business_tz())::date, to_char(date_trunc('month', (now() at time zone public.business_tz())) - interval '1 day', 'YYYY-MM'))`).split("|");
const ym = from.slice(0, 7);

const company = Number(sql(`insert into public.companies (name, sales_rep_id) values (${lit(`${TAG} Co`)}, ${MIKE}) returning id`));
const P = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, bill_lead_rate, bill_appointment_rate)
  values (${lit(`${TAG} Appts`)}, ${company}, (select id from public.project_types where code = 'APPT'), 1, 15, 70) returning id`));
const lead = (name, f = {}) => Number(sql(`insert into public.leads (company_name, project_id, stage, promoted_at, dbdv_user_id, call_result_dbdv)
  values (${lit(`${TAG} ${name}`)}, ${P}, 'appt', ${f.at ?? "now()"}, ${SEAN}, ${f.invalid ? "'Lead-Invalid'" : "'Lead'"}) returning id`));
// This month Sean developed three leads and an invalid one; last month, one more.
const [L1, L2, L3] = ["Alpha", "Bravo", "Charlie"].map((n) => lead(n));
lead("Delta", { invalid: true });
lead("Echo", { at: `(date_trunc('month', now() at time zone public.business_tz()) - interval '5 days') at time zone public.business_tz()` });
// …and set appointments on them: one confirmed, one pending, one invalid; Rachel one rescheduled.
const appt = (leadId, user, f = "") => Number(sql(`insert into public.appointments (lead_id, project_id, set_project_id, user_id, appt_date, status_id, confirmed_at, invalid_at)
  values (${leadId}, ${P}, ${P}, ${user}, current_date + 7, (select id from public.appointment_statuses where name = ${lit(f === "rescheduled" ? "Rescheduled" : "Scheduled")}),
  ${f === "confirmed" ? "now()" : "null"}, ${f === "invalid" ? "now()" : "null"}) returning id`));
const A1 = appt(L1, SEAN, "confirmed");
appt(L2, SEAN);
appt(L3, SEAN, "invalid");
appt(L3, RACHEL, "rescheduled");
// Not our managers' (Sean, Nov 2026): a lead and an appointment with no one behind them (as a list loads
// them), and a lead and an appointment by the client's own people. None count anywhere.
const CLIENT = Number(sql("select id from public.users where email = 'client@beacon.test'"));
const loose = (name, who) => Number(sql(`insert into public.leads (company_name, project_id, stage, promoted_at, dbdv_user_id, call_result_dbdv)
  values (${lit(`${TAG} ${name}`)}, ${P}, 'appt', now(), ${who}, 'Lead') returning id`));
appt(loose("Loaded", "null"), "null");
appt(loose("Theirs", CLIENT), CLIENT);
// Called: Alpha twice, Bravo once.
for (const l of [L1, L1, L2]) sql(`insert into public.call_records (lead_id, project_id, user_id) values (${l}, ${P}, ${SEAN})`);
// Paid: Alpha's lead $5, Bravo's $5 charged back, the confirmed appointment $20 and its confirmation $10.
const pay = (l, kind, amount, a = "null") =>
  sql(`insert into public.pay_events (user_id, project_id, lead_id, appointment_id, kind, amount) values (${SEAN}, ${P}, ${l}, ${a}, '${kind}', ${amount})`);
pay(L1, "lead", 5);
pay(L2, "lead", 5);
pay(L2, "lead", -5);
pay(L1, "appointment", 20, A1);
pay(L1, "confirmation", 10, A1);

const admin = await signIn("admin@beacon.test");
const manager = await signIn("sean@beacon.test");
const figures = (r) => r && ["leads", "invalid_leads", "appts", "confirmed", "pending", "invalid_appts", "rescheduled"].map((k) => Number(r[k])).join("/");

try {
  section("report_counts: by month, project and manager");
  const { data, error } = await admin.sb.rpc("report_counts", { p_from: from, p_to: today });
  const mine = (data ?? []).filter((r) => Number(r.project_id) === P);
  const by = (user) => mine.find((r) => Number(r.user_id) === user);
  //                                                  leads/invalid/appts/confirmed/pending/invalid appts/rescheduled
  check("Sean's: three leads, one invalid; two appointments, one confirmed, one pending, one invalid", !error && figures(by(SEAN)) === "3/1/2/1/1/1/0", error?.message ?? figures(by(SEAN)));
  check("Rachel's: a rescheduled appointment, still pending", figures(by(RACHEL)) === "0/0/1/0/1/0/1", figures(by(RACHEL)));
  check("only our managers': nothing loaded with no one behind it, nothing the client's people did", !mine.some((r) => r.user_id == null || Number(r.user_id) === CLIENT), JSON.stringify(mine.map((r) => r.user_id)));
  check("all in this month", mine.length === 2 && mine.every((r) => r.ym === ym), JSON.stringify(mine.map((r) => r.ym)));
  const wider = await admin.sb.rpc("report_counts", { p_from: `${lastMonth}-01`, p_to: today });
  const before = (wider.data ?? []).find((r) => Number(r.project_id) === P && r.ym === lastMonth);
  check("last month's lead in last month", !wider.error && figures(before) === "1/0/0/0/0/0/0", wider.error?.message ?? figures(before));

  section("billing_report: each active client's project");
  const bill = await admin.sb.rpc("billing_report", { p_from: from, p_to: today, p_rep: null });
  const row = (bill.data ?? []).find((r) => Number(r.project_id) === P);
  check("leads, appointments (invalid ones apart), confirmed, invalid, pending", !bill.error && row && figures({ ...row, rescheduled: 0 }) === "3/1/3/1/2/1/0", bill.error?.message ?? JSON.stringify(row));
  check("the names called: each once", Number(row?.names_called) === 2, row?.names_called);
  check("the cost: the managers' pay, a chargeback taken off", Number(row?.cost) === 35, row?.cost);
  check("the client, its Sales Rep and the project's billing rates", row?.client === `${TAG} Co` && row?.sales_rep === "Mike Preston" && Number(row?.bill_lead_rate) === 15 && Number(row?.bill_appointment_rate) === 70,
    JSON.stringify(row && [row.client, row.sales_rep, row.bill_lead_rate, row.bill_appointment_rate]));
  const mikes = await admin.sb.rpc("billing_report", { p_from: from, p_to: today, p_rep: MIKE });
  const rachels = await admin.sb.rpc("billing_report", { p_from: from, p_to: today, p_rep: RACHEL });
  check("a Sales Rep's clients alone", (mikes.data ?? []).some((r) => Number(r.project_id) === P) && !(rachels.data ?? []).some((r) => Number(r.project_id) === P));
  sql(`update public.companies set status = 'inactive' where id = ${company}`);
  const gone = await admin.sb.rpc("billing_report", { p_from: from, p_to: today, p_rep: null });
  check("an inactive client's projects aren't listed", !gone.error && !(gone.data ?? []).some((r) => Number(r.project_id) === P), gone.error?.message);
  sql(`update public.companies set status = 'active' where id = ${company}`);

  section("report_items: the names behind a figure");
  const items = async (kind) => (await admin.sb.rpc("report_items", { p_from: from, p_to: today, p_project: P, p_kind: kind })).data ?? [];
  const leads = await items("leads");
  check("the leads: the business, its manager, Sales Rep and what its lead pay came to",
    JSON.stringify(leads.map((i) => [i.company.replace(`${TAG} `, ""), i.manager, i.sales_rep, Number(i.cost), i.status])) ===
      JSON.stringify([["Alpha", "Sean Fitzgerald", "Mike Preston", 5, "Developed"], ["Bravo", "Sean Fitzgerald", "Mike Preston", 0, "Developed"], ["Charlie", "Sean Fitzgerald", "Mike Preston", 0, "Developed"]]),
    JSON.stringify(leads.map((i) => [i.company, i.manager, i.sales_rep, i.cost, i.status])));
  check("the invalid lead", (await items("invalid_leads")).map((i) => i.company).join() === `${TAG} Delta`);
  const confirmed = await items("confirmed");
  check("the confirmed appointment, its pay and confirmation its cost", confirmed.length === 1 && Number(confirmed[0].appointment_id) === A1 && Number(confirmed[0].cost) === 30 && confirmed[0].status === "Confirmed",
    JSON.stringify(confirmed));
  check("the appointments: pending and confirmed, not the invalid one", (await items("appts")).length === 3 && (await items("pending")).length === 2 && (await items("invalid_appts")).length === 1);
  const odd = await admin.sb.rpc("report_items", { p_from: from, p_to: today, p_project: P, p_kind: "everything" });
  check("an unknown figure refused", Boolean(odd.error));

  section("Administrators only");
  for (const [fn, args] of [["report_counts", { p_from: from, p_to: today }], ["billing_report", { p_from: from, p_to: today, p_rep: null }], ["report_items", { p_from: from, p_to: today, p_project: P, p_kind: "leads" }]]) {
    const r = await manager.sb.rpc(fn, args);
    check(`${fn}: a manager is refused`, r.error?.code === "42501", r.error?.message ?? "allowed");
  }
  const far = await admin.sb.rpc("report_counts", { p_from: "2020-01-01", p_to: today });
  check("more than a year at once refused", Boolean(far.error));
} finally {
  const like = lit(`${TAG}%`);
  sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)} or body like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.pay_events where project_id = ${P}`);
  sql(`delete from public.call_records where project_id = ${P}`);
  sql(`delete from public.appointments where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.leads where company_name like ${like}`);
  sql(`delete from public.projects where id = ${P}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("admin reports");
