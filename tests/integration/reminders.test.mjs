/**
 * Call-back reminders, against the database as real signed-in users: who may
 * set one, the time read on the business's clock and never in the past,
 * each person seeing and cancelling only their own, and a due reminder
 * becoming one notification that links to the lead.
 *
 * Runs on its own test client and removes everything it made.
 *
 *   npm run test:integration
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `RM-TEST ${Date.now()}`;
const SEAN = Number(sql("select id from public.users where email='sean@beacon.test'"));
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} DBDev`)}, ${company}, (select id from public.project_types where code='DBDV'), 1) returning id`));
const lead = Number(sql(`insert into public.leads (company_name, project_id, assigned_user_id) values (${lit(`${TAG} Sine Wave`)}, ${project}, ${SEAN}) returning id`));
const tomorrow = sql("select ((now() at time zone public.business_tz())::date + 1)::text");

const sean = (await signIn("sean@beacon.test")).sb;
const agent = (await signIn("agent@beacon.test")).sb;
const admin = (await signIn("admin@beacon.test")).sb;
const set = (sb, date, time, note = null) => sb.rpc("set_reminder", { p_lead_id: lead, p_date: date, p_time: time, p_note: note });

try {
  section("Setting one");
  const { data: made, error } = await set(sean, tomorrow, "2:00 PM", "Ask for Henry");
  check("the rep on the name sets a reminder", !error && Boolean(made?.id), error?.message);
  const local = sql(`select to_char(remind_at at time zone public.business_tz(), 'YYYY-MM-DD HH24:MI') from public.reminders where id=${made?.id}`);
  check("…for 2:00 PM on the business's clock", local === `${tomorrow} 14:00`, local);
  const past = await set(sean, sql("select ((now() at time zone public.business_tz())::date - 1)::text"), "2:00 PM");
  check("a time already gone is refused", /already passed/.test(past.error?.message ?? ""), past.error?.message);
  const bad = await set(sean, tomorrow, "25:00 XM");
  check("…and a time that is no time", /time like 2:00 PM/.test(bad.error?.message ?? ""), bad.error?.message);
  const notMine = await set(agent, tomorrow, "2:00 PM");
  check("someone not on the name cannot set one", /not on your call list/.test(notMine.error?.message ?? ""), notMine.error?.message);
  const { error: direct } = await sean.from("reminders").insert({ lead_id: lead, user_id: SEAN, remind_at: new Date().toISOString() });
  check("…nor can anyone write the table directly", Boolean(direct), direct?.message);

  section("Seeing and cancelling");
  const seen = async (sb) => ((await sb.from("reminders").select("id").eq("lead_id", lead)).data ?? []).length;
  check("my reminders are mine to see", (await seen(sean)) === 1 && (await seen(agent)) === 0);
  check("…and an administrator's to see too", (await seen(admin)) === 1);
  await agent.rpc("cancel_reminder", { p_id: made.id });
  check("someone else cannot cancel it", sql(`select count(*) from public.reminders where id=${made.id}`) === "1");
  const { data: second } = await set(sean, tomorrow, "3:00 PM");
  await sean.rpc("cancel_reminder", { p_id: second.id });
  check("I can cancel mine", sql(`select count(*) from public.reminders where id=${second.id}`) === "0");

  section("When it is due");
  sql(`update public.reminders set remind_at = now() - interval '1 minute' where id = ${made.id}`);
  const sent = Number(sql("select public.deliver_reminders()"));
  const note = JSON.parse(sql(`select row_to_json(n) from (select n.user_id, n.kind, n.title, n.body, n.link from public.notifications n
    join public.reminders m on m.notification_id = n.id where m.id = ${made.id}) n`) || "null");
  check("a due reminder becomes a notification to its owner", sent >= 1 && note?.user_id === SEAN && note?.kind === "reminder", JSON.stringify(note));
  check("…“Call back: <company>”, with the time and the note, linking to the lead",
    note?.title === `Call back: ${TAG} Sine Wave` && /Reminder for \d{1,2}:\d{2} [AP]M · Ask for Henry/.test(note?.body) && note?.link === `/leads/${lead}`, JSON.stringify(note));
  check("…once", Number(sql("select public.deliver_reminders()")) === 0 && sql(`select count(*) from public.notifications where link = '/leads/${lead}' and kind = 'reminder'`) === "1");
  check("pg_cron runs it every minute", sql("select schedule || ' ' || active::text from cron.job where jobname = 'deliver-reminders'") === "* * * * * true");
} finally {
  sql(`delete from public.notifications where kind = 'reminder' and link = '/leads/${lead}'`);
  sql(`delete from public.leads where id = ${lead}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("reminder");
