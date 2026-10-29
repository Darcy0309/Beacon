/**
 * The Clients page's figures (Sean, Oct 2026), against the database as real
 * signed-in people: the active clients' leads and appointments by call
 * result, and what was developed for them over time; a paused, completed
 * or deleted client's are left out; administrators and managers only.
 *
 * Removes everything it made.
 *
 *   node tests/integration/clients-page.test.mjs
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `CP-TEST ${Date.now()}`;
const type = (code) => sql(`select id from public.project_types where code='${code}'`);
const result = (t, name) => Number(sql(`select id from public.call_results where project_type='${t}' and name=${lit(name)}`));
const admin = await signIn("admin@beacon.test");
const sean = await signIn("sean@beacon.test");
const agent = await signIn("agent@beacon.test");
const client = await signIn("client@beacon.test");
const today = sql("select ((now() at time zone public.business_tz())::date)::text");

const company = (name, status) => Number(sql(`insert into public.companies (name, status) values (${lit(`${TAG} ${name}`)}, ${lit(status)}) returning id`));
const project = (co, name) => Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} ${name}`)}, ${co}, ${type("APPT")}, 1) returning id`));
const lead = (p, name) => sql(`insert into public.leads (company_name, project_id, stage, result_id) values (${lit(`${TAG} ${name}`)}, ${p}, 'appt', ${result("APPT", name)})`);
const event = (p, kind, when = "now()") => sql(`insert into public.pay_events (user_id, project_id, kind, amount, created_at) values (${sean.me.id}, ${p}, ${lit(kind)}, 1, ${when})`);
const totals = async (who = admin) => (await who.sb.rpc("clients_totals")).data?.[0];
const chart = async (who = admin, from = today, to = today) => who.sb.rpc("clients_chart", { p_from: from, p_to: to });
const sum = (d, k) => (d?.days ?? []).reduce((n, r) => n + Number(r[k]), 0);

const before = await totals();
const beforeChart = (await chart()).data;
const A = company("Active Co", "active");
const P = company("Paused Co", "paused");
const C = company("Completed Co", "completed");
const [pa, pp, pc] = [project(A, "A"), project(P, "P"), project(C, "C")];
try {
  section("Counted by call result, for active clients");
  for (const p of [pa, pp, pc]) {
    lead(p, "Lead-No Contact");        // an active lead
    lead(p, "Lead-Removed");           // a resolved one
    lead(p, "Appointment");            // an appointment
    lead(p, "Appointment-Invalid");    // an invalid one
  }
  const t = await totals();
  const gained = Object.fromEntries(Object.keys(t).map((k) => [k, Number(t[k]) - Number(before[k])]));
  check("an active client's names count: leads active and resolved, appointments, invalid ones", gained.appointments === 1 && gained.invalid_appointments === 1 && gained.leads_active + gained.leads_resolved === 4, JSON.stringify(gained));
  check("…a paused or completed client's do not", gained.leads_active + gained.leads_resolved === 4);
  check("a manager sees the same", JSON.stringify(await totals(sean)) === JSON.stringify(t));

  section("Developed over time, for active clients");
  for (const p of [pa, pp, pc]) {
    event(p, "lead");
    event(p, "lead");
    event(p, "appointment");
  }
  event(pa, "lead", "now() - interval '40 days'");
  sql(`insert into public.pay_events (user_id, project_id, kind, amount) values (${sean.me.id}, ${pa}, 'lead', -1)`);   // a chargeback
  const day = (await chart()).data;
  check("today: the active client's 2 leads and 1 appointment, not the others' nor a chargeback", sum(day, "leads") - sum(beforeChart, "leads") === 2 && sum(day, "appts") - sum(beforeChart, "appts") === 1,
    `${sum(day, "leads") - sum(beforeChart, "leads")} leads, ${sum(day, "appts") - sum(beforeChart, "appts")} appts`);
  check("…a single day comes by the hour too", Array.isArray(day.hours) && day.hours.reduce((n, h) => n + Number(h.leads), 0) === sum(day, "leads"));
  const wide = (await chart(admin, sql(`select (${lit(today)}::date - 60)::text`), today)).data;
  check("a range reaches back: the lead of 40 days ago is in it, a day at a time", wide.hours === null && wide.days.length >= 2 && sum(wide, "leads") >= sum(day, "leads") + 1, JSON.stringify(wide.days.slice(0, 3)));
  check("a manager sees every client's, not only their own pay", sum((await chart(sean)).data, "leads") === sum(day, "leads"));

  section("One Sales Rep's clients");
  // Sean's client (Oct 2026): picking a Sales Rep on the Clients list counts the tiles for that rep's clients.
  const only = await admin.sb.rpc("clients_totals", { p_companies: [A] });
  check("the totals for the clients given, and only theirs", JSON.stringify(only.data?.[0]) === JSON.stringify({ leads_active: 1, leads_resolved: 3, appointments: 1, invalid_appointments: 1 }), JSON.stringify(only.data ?? only.error));
  check("…none for a client not active", JSON.stringify((await admin.sb.rpc("clients_totals", { p_companies: [P] })).data?.[0]) === JSON.stringify({ leads_active: 0, leads_resolved: 0, appointments: 0, invalid_appointments: 0 }));
  const theirs = (await admin.sb.rpc("clients_chart", { p_from: today, p_to: today, p_companies: [A] })).data;
  check("the chart for the clients given: today's 2 leads and 1 appointment", sum(theirs, "leads") === 2 && sum(theirs, "appts") === 1, JSON.stringify(theirs?.days));
  check("…nothing for no clients", sum((await admin.sb.rpc("clients_chart", { p_from: today, p_to: today, p_companies: [] })).data, "leads") === 0);

  section("Who may ask");
  check("an agent may not", Boolean((await chart(agent)).error));
  check("a client may not", Boolean((await chart(client)).error));
  check("more than two years is refused", Boolean((await chart(admin, "2020-01-01", today)).error));

  section("Status changes and deletes");
  sql(`update public.companies set status = 'paused' where id = ${A}`);
  check("pausing the client takes its figures off", sum((await chart()).data, "leads") === sum(beforeChart, "leads") && Number((await totals()).appointments) === Number(before.appointments));
  sql(`update public.companies set status = 'active' where id = ${A}`);
  check("…active again, they are back", sum((await chart()).data, "leads") === sum(day, "leads"));
  check("a deleted client's are left out", (await sean.sb.rpc("remove_record", { p_table: "companies", p_id: A })).data === true
    && sum((await chart()).data, "leads") === sum(beforeChart, "leads") && Number((await totals()).appointments) === Number(before.appointments));
  check("…and come back when it is restored", (await admin.sb.rpc("restore_record", { p_table: "companies", p_id: A })).data === true && sum((await chart()).data, "leads") === sum(day, "leads"));

  section("The statuses a client can have");
  const bad = await admin.sb.from("companies").update({ status: "archived" }).eq("id", A);
  check("active, paused or completed; nothing else", Boolean(bad.error) && !(await admin.sb.from("companies").update({ status: "completed" }).eq("id", A)).error);
} finally {
  sql(`delete from public.pay_events where project_id in (${pa}, ${pp}, ${pc})`);
  sql(`delete from public.leads where company_name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.projects where id in (${pa}, ${pp}, ${pc})`);
  sql(`delete from public.companies where id in (${A}, ${P}, ${C})`);
}

finish("clients page");
