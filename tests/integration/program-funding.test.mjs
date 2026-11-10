#!/usr/bin/env node
/**
 * Program Funding (client, Nov 2026): a project's plan and payments, kept by an
 * administrator; seen and marked paid by the administrators and the client's
 * Sales Rep only; a paid payment kept when the plan changes; the Sales Rep told
 * 5 days before a payment is due (once); each month's bill for what was produced;
 * a reminder to the client only when it takes them.
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";
import { fundingSchedule, readFunding } from "../../src/lib/funding.js";

const TAG = `PF-TEST ${Date.now()}`;
const admin = await signIn("admin@beacon.test");
const sean = await signIn("sean@beacon.test"); // a manager: this client's Sales Rep
const mike = await signIn("mike@beacon.test"); // a manager: not
const client = await signIn("client@beacon.test");

const type = (code) => Number(sql(`select id from public.project_types where code = '${code}'`));
const company = Number(sql(`insert into public.companies (name, sales_rep_id) values (${lit(`${TAG} Insurance`)}, ${sean.me.id}) returning id`));
const project = (name, extra = "") => Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, bill_lead_rate, bill_appointment_rate, start_date${extra ? `, ${extra.split("=")[0]}` : ""})
  values (${lit(`${TAG} ${name}`)}, ${company}, ${type("DBDV")}, 1, 15, 75, current_date - 90${extra ? `, ${extra.split("=")[1]}` : ""}) returning id`));
const P = project("Installments");
const M = project("Monthly");
const clientCompany = sql(`select coalesce(company_id::text, 'null') from public.users where id = ${client.me.id}`);
const rows = (who, table, col, id) => who.sb.from(table).select("*").eq(col, id).then((r) => r.data ?? []);
const today = sql("select (now() at time zone public.business_tz())::date::text");
const plus = (n) => sql(`select (${lit(today)}::date + ${n})::text`);

const save = (who, id, f) => {
  const plan = readFunding(f);
  return who.sb.rpc("save_project_funding", {
    p_project: id,
    p_funding: { plan: plan.plan, leads: plan.leads, appts: plan.appts, appts_included: plan.apptsIncluded, setup_fee: plan.setupFee, list_fee: plan.listFee,
      payments: plan.payments, first_leads: plan.firstLeads, first_due: plan.firstDue, due_day: plan.dueDay },
    p_payments: fundingSchedule(plan, { lead: 15, appt: 75 }).payments,
  });
};
const example = { plan: "installments", leads: 200, appts: 50, apptsIncluded: true, setupFee: 500, listFee: 350, payments: 6, firstLeads: 50, firstDue: plus(5), dueDay: 15 };

try {
  section("An administrator sets the plan; its installments kept");
  check("saved by an administrator", !(await save(admin, P, example)).error);
  const pays = await rows(admin, "project_payments", "project_id", P);
  check("the client's example: six payments, $1,600 then five of $1,200, $7,600 in all",
    pays.length === 6 && Number(pays.find((p) => p.seq === 1).amount) === 1600 && pays.filter((p) => p.seq > 1).every((p) => Number(p.amount) === 1200)
    && pays.reduce((n, p) => n + Number(p.amount), 0) === 7600, JSON.stringify(pays.map((p) => [p.seq, p.amount])));
  check("a manager can't set it", Boolean((await save(sean, P, example)).error));

  section("Seen by the administrators and the client's Sales Rep only");
  check("the Sales Rep sees the plan and payments", (await rows(sean, "project_funding", "project_id", P)).length === 1 && (await rows(sean, "project_payments", "project_id", P)).length === 6);
  check("another manager sees neither", (await rows(mike, "project_funding", "project_id", P)).length === 0 && (await rows(mike, "project_payments", "project_id", P)).length === 0);
  check("the client sees neither", (await rows(client, "project_payments", "project_id", P)).length === 0);

  section("Marked paid; kept when the plan changes");
  const first = pays.find((p) => p.seq === 1).id;
  check("another manager can't mark it paid", Boolean((await mike.sb.rpc("set_payment_paid", { p_payment: first, p_paid: true })).error));
  check("the Sales Rep marks it paid", !(await sean.sb.rpc("set_payment_paid", { p_payment: first, p_paid: true })).error
    && sql(`select paid_by from public.project_payments where id = ${first}`) === String(sean.me.id));
  check("over 3 payments now: the paid one as it was, three in all", !(await save(admin, P, { ...example, payments: 3 })).error);
  const after = await rows(admin, "project_payments", "project_id", P);
  check("…the paid first kept, unpaid ones redone", after.length === 3 && after.find((p) => p.seq === 1)?.paid_at && Number(after.find((p) => p.seq === 1).amount) === 1600
    && after.filter((p) => p.seq > 1).every((p) => Number(p.amount) === 3000), JSON.stringify(after.map((p) => [p.seq, p.amount, Boolean(p.paid_at)])));

  section("The Sales Rep told 5 days before a payment is due, once");
  // The unpaid second payment due in 5 days; one due in 9 not yet.
  const second = after.find((p) => p.seq === 2).id;
  const third = after.find((p) => p.seq === 3).id;
  sql(`update public.project_payments set due_date = ${lit(plus(5))} where id = ${second}`);
  sql(`update public.project_payments set due_date = ${lit(plus(9))} where id = ${third}`);
  sql(`update public.project_payments set due_date = ${lit(plus(5))} where id = ${first}`);
  const told = () => sql(`select count(*) from public.notifications where user_id = ${sean.me.id} and link = '/payments' and title like ${lit(`%${TAG} Insurance%`)}`);
  sql(`select public.send_payment_reminders(${lit(today)}::date)`);
  check("told of the one due in 5 days, not the paid one nor the later one", told() === "1", told());
  check("…with the project and how it is doing", /Leads \d+ of 200 delivered/.test(sql(`select body from public.notifications where user_id = ${sean.me.id} and link = '/payments' and title like ${lit(`%${TAG} Insurance%`)} limit 1`)));
  sql(`select public.send_payment_reminders(${lit(today)}::date)`);
  check("…and only once", told() === "1", told());
  sql(`update public.companies set sales_rep_id = null where id = ${company}`);
  sql(`update public.project_payments set due_date = ${lit(plus(4))} where id = ${third}`);
  const admins = () => sql(`select count(*) from public.notifications n join public.users u on u.id = n.user_id where u.role = 'admin' and n.link = '/payments' and n.title like ${lit(`%${TAG} Insurance%`)}`);
  sql(`select public.send_payment_reminders(${lit(today)}::date)`);
  check("a client with no Sales Rep: the administrators told", Number(admins()) >= 1, admins());
  sql(`update public.companies set sales_rep_id = ${sean.me.id} where id = ${company}`);

  section("Each month's bill for what was produced");
  check("a monthly plan saved", !(await save(admin, M, { plan: "monthly", dueDay: 10 })).error);
  // Two leads delivered last month and one invalid, by a staff member.
  const lastMonth = sql(`select (date_trunc('month', ${lit(today)}::date) - interval '1 month' + interval '3 days 12 hours')::timestamptz::text`);
  for (const [i, invalid] of [[1, false], [2, false], [3, true]]) {
    sql(`insert into public.leads (company_name, project_id, stage, promoted_at, dbdv_user_id${invalid ? ", call_result_dbdv" : ""})
      values (${lit(`${TAG} lead ${i}`)}, ${M}, 'appt', ${lit(lastMonth)}, ${sean.me.id}${invalid ? ", 'Lead-Invalid'" : ""})`);
  }
  sql(`select public.bill_project_months(${lit(today)}::date)`);
  const bill = await rows(admin, "project_payments", "project_id", M);
  check("last month's bill: its two valid leads at $15", bill.length === 1 && bill[0].kind === "monthly" && Number(bill[0].amount) === 30 && bill[0].leads === 2,
    JSON.stringify(bill.map((b) => [b.kind, b.amount, b.leads, b.appts, b.due_date])));
  check("…due on its day this month", bill[0]?.due_date?.slice(8, 10) === "10" && bill[0]?.due_date?.slice(0, 7) === today.slice(0, 7), bill[0]?.due_date);
  sql(`select public.bill_project_months(${lit(today)}::date)`);
  check("…made once", (await rows(admin, "project_payments", "project_id", M)).length === 1);

  section("A reminder to the client only when it takes them");
  const reminder = async (who) => (await who.sb.rpc("payment_reminder", { p_payment: second })).data;
  check("reminders off: said so", (await reminder(sean))?.on === false);
  sql(`update public.companies set payment_reminders = true where id = ${company}`);
  if (clientCompany !== "null") sql(`update public.users set company_id = ${company} where id = ${client.me.id}`);
  const r = await reminder(sean);
  check("on: to the client's people", r?.on === true && r.to.some((t) => t.email === "client@beacon.test"), JSON.stringify(r?.to));
  check("…not for another manager", Boolean((await mike.sb.rpc("payment_reminder", { p_payment: second })).error));
} finally {
  if (clientCompany !== "null") sql(`update public.users set company_id = ${clientCompany} where id = ${client.me.id}`);
  sql(`delete from public.notifications where link = '/payments' and title like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.leads where project_id in (${P}, ${M})`);
  sql(`delete from public.projects where id in (${P}, ${M})`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("program funding");
