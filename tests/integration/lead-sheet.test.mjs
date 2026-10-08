/**
 * The lead sheet as the client asked, in the database, as real signed-in
 * users: the note for the client is written as the lead or appointment is
 * set (and only then); the internal notes (lead_notes) cannot be read by a
 * client even straight through the API, while staff read them; recording an appointment
 * again at the same day and time does not say it "moved"; and every
 * standard SIC code has its description.
 *
 * Runs on its own test client and removes everything it made.
 *
 *   npm run test:integration
 */
import { readFileSync } from "node:fs";
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `LS-TEST ${Date.now()}`;
const all = (query) => JSON.parse(sql(`select coalesce(json_agg(t), '[]') from (${query}) t`));
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const SEAN = userId("sean@beacon.test");
const MIKE = userId("mike@beacon.test");
const CLIENT_USER = userId("client@beacon.test");
const RESULT = Object.fromEntries(all("select id, project_type, name from public.call_results").map((r) => [`${r.project_type}:${r.name}`, r.id]));

const companyId = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const typeId = (code) => sql(`select id from public.project_types where code=${lit(code)}`);
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} Appointments`)}, ${companyId}, ${typeId("APPT")}, 1) returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id)
  values (${lit(`${TAG} DBDev`)}, ${companyId}, ${typeId("DBDV")}, 1, ${APPT}) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${DBDV}, ${SEAN}), (${APPT}, ${MIKE})`);
const clientCompany = sql(`select coalesce(company_id::text, 'null') from public.users where id=${CLIENT_USER}`);
sql(`update public.users set company_id=${companyId} where id=${CLIENT_USER}`);

let n = 0;
const newName = (project, rep, extra = "") => {
  n += 1;
  const id = Number(sql(`insert into public.leads (company_name, project_id, assigned_user_id)
    values (${lit(`${TAG} Co ${n}`)}, ${project}, ${rep}) returning id`));
  sql(`insert into public.lead_notes (lead_id, notes) values (${id}, 'Internal: owner is difficult. 10/1/26 seanf: left message${extra}')`);
  sql(`insert into public.insurance_details (lead_id, ultimate_xdate) values (${id}, '2027-03-01')`);
  return id;
};
const day = (offset) => sql(`select ((now() at time zone public.business_tz())::date + ${offset})::text`);
const clientNote = (id) => sql(`select coalesce(client_note, '<none>') from public.leads where id=${id}`);
const lastNotes = (id) => sql(`select coalesce(notes, '') from public.call_records where lead_id=${id} order by id desc limit 1`);

const sean = await signIn("sean@beacon.test");
const mike = await signIn("mike@beacon.test");
const client = await signIn("client@beacon.test");
const agent = await signIn("agent@beacon.test");
const record = (who, leadId, type, name, extra = {}) =>
  who.sb.rpc("record_call_result", { p_lead_id: leadId, p_result_id: RESULT[`${type}:${name}`], p_notes: "10/7/26 seanf: spoke with Daniel", ...extra });

try {
  section("Client notes");
  const lead = newName(DBDV, SEAN);
  const promoted = await record(sean, lead, "DBDV", "Lead", { p_client_note: "  Lead set with Daniel, owner – renews 3/1  " });
  check("setting a Lead writes the note for the client", !promoted.error && clientNote(lead) === "Lead set with Daniel, owner – renews 3/1", promoted.error?.message ?? clientNote(lead));
  check("…the call notes stay on the call", lastNotes(lead) === "10/7/26 seanf: spoke with Daniel");
  const appt = await record(mike, lead, "APPT", "Appointment", { p_appointment: { date: day(3), time: "10:00 AM" }, p_client_note: "Appt set with Daniel and Henry, both owners" });
  check("setting the appointment replaces it", !appt.error && clientNote(lead) === "Appt set with Daniel and Henry, both owners", appt.error?.message ?? clientNote(lead));
  const callback = newName(DBDV, SEAN);
  sql(`update public.leads set client_note = 'Kept' where id = ${callback}`);
  await record(sean, callback, "DBDV", "Viable-CallBack", { p_client_note: null });
  check("a result that sends nothing leaves it alone", clientNote(callback) === "Kept");
  const tooLong = await record(sean, newName(DBDV, SEAN), "DBDV", "Lead", { p_client_note: "x".repeat(2001) });
  check("…and a note longer than 2,000 characters is refused, saying so", /note for the client/.test(tooLong.error?.message ?? ""), tooLong.error?.message);

  section("Internal notes are staff only");
  const asClient = await client.sb.from("leads").select("id, company_name, client_note").eq("id", lead).maybeSingle();
  check("the client reads the lead and what was written for them", !asClient.error && asClient.data?.client_note === "Appt set with Daniel and Henry, both owners", asClient.error?.message);
  const star = await client.sb.from("leads").select("*").eq("id", lead);
  check("…and every column of it holds nothing internal", !star.error && star.data?.length === 1 && !/difficult|left message/.test(JSON.stringify(star.data)), star.error?.message);
  const sneak = await client.sb.from("lead_notes").select("*").eq("lead_id", lead);
  check("…not the internal notes, even straight through the API", !sneak.error && sneak.data.length === 0, JSON.stringify(sneak.data));
  const write = await client.sb.from("lead_notes").update({ notes: "client wrote this" }).eq("lead_id", lead).select("lead_id");
  check("…nor write them", (write.data ?? []).length === 0 && /^Internal: owner is difficult/.test(sql(`select notes from public.lead_notes where lead_id = ${lead}`)));
  const calls = await client.sb.from("call_records").select("notes").eq("lead_id", lead);
  // Refused outright (the column is no one's to read directly), or no rows (the calls are staff's).
  check("…nor the call notes", Boolean(calls.error) || (calls.data ?? []).length === 0, JSON.stringify(calls.data));
  const staff = await sean.sb.from("lead_notes").select("notes").eq("lead_id", lead).maybeSingle();
  check("staff read them", /^Internal: owner is difficult.*left message/.test(staff.data?.notes ?? ""), JSON.stringify(staff));
  const managerCalls = await sean.sb.rpc("call_notes", { p_lead_id: lead });
  check("…and the notes on its calls, through call_notes()", !managerCalls.error && managerCalls.data.some((c) => /spoke with Daniel/.test(c.notes)), JSON.stringify(managerCalls));

  section("Agents see the client notes only");
  const agentLead = await agent.sb.from("leads").select("id, client_note").eq("id", lead).maybeSingle();
  check("an agent reads the lead and its client notes", !agentLead.error && /Appt set with Daniel/.test(agentLead.data?.client_note ?? ""), agentLead.error?.message);
  const agentNotes = await agent.sb.from("lead_notes").select("*").eq("lead_id", lead);
  check("…not its internal notes", !agentNotes.error && agentNotes.data.length === 0, JSON.stringify(agentNotes.data));
  const agentWrite = await agent.sb.from("lead_notes").upsert({ lead_id: lead, notes: "agent wrote this" }, { onConflict: "lead_id" }).select("lead_id");
  check("…nor write them", Boolean(agentWrite.error) && !/agent wrote this/.test(sql(`select notes from public.lead_notes where lead_id = ${lead}`)), agentWrite.error?.message);
  const agentCalls = await agent.sb.from("call_records").select("id, call_result, call_date").eq("lead_id", lead);
  check("…still reads its calls (QA, the history)", !agentCalls.error && agentCalls.data.length > 0, agentCalls.error?.message);
  const agentCallNotes = await agent.sb.from("call_records").select("id, notes").eq("lead_id", lead);
  const agentStar = await agent.sb.from("call_records").select("*").eq("lead_id", lead);
  check("…but not what was said on them, even straight through the API", Boolean(agentCallNotes.error) && (Boolean(agentStar.error) || !/spoke with Daniel/.test(JSON.stringify(agentStar.data))), JSON.stringify([agentCallNotes.error?.message, agentStar.error?.message]));
  const agentRpc = await agent.sb.rpc("call_notes", { p_lead_id: lead });
  check("…nor through call_notes()", !agentRpc.error && agentRpc.data.length === 0, JSON.stringify(agentRpc));
  const qaCount = await agent.sb.from("call_records").select("id", { count: "exact", head: true });
  check("…and counting calls still works (QA)", !qaCount.error && qaCount.count > 0, qaCount.error?.message);

  const deleted = Number(sql(`insert into public.leads (company_name, project_id) values (${lit(`${TAG} Gone`)}, ${DBDV}) returning id`));
  sql(`insert into public.lead_notes (lead_id, notes) values (${deleted}, 'x')`);
  sql(`delete from public.leads where id = ${deleted}`);
  check("a lead's notes go with it", sql(`select count(*) from public.lead_notes where lead_id = ${deleted}`) === "0");

  section("Call notes join the internal notes");
  const internal = (id) => sql(`select coalesce(notes, '') from public.lead_notes where lead_id = ${id}`);
  const fresh = newName(DBDV, SEAN);
  const before = internal(fresh);
  await record(sean, fresh, "DBDV", "Viable-CallBack", { p_notes: "10/8/26 seanf: nw vm" });
  await record(sean, fresh, "DBDV", "Viable-CallBack", { p_notes: "10/9/26 seanf: spoke w/ Kristy, call Mon" });
  check("each call's notes are added to the end of the internal notes, in order",
    internal(fresh) === `${before}\n10/8/26 seanf: nw vm\n10/9/26 seanf: spoke w/ Kristy, call Mon`, internal(fresh));
  await record(sean, fresh, "DBDV", "Viable-CallBack", { p_notes: "   " });
  check("…a call with no notes adds nothing", internal(fresh).endsWith("call Mon"));
  const noNotes = Number(sql(`insert into public.leads (company_name, project_id, assigned_user_id) values (${lit(`${TAG} Fresh`)}, ${DBDV}, ${SEAN}) returning id`));
  await record(sean, noNotes, "DBDV", "Viable-CallBack", { p_notes: "10/8/26 seanf: first call" });
  check("…a lead with no internal notes yet gets them", internal(noNotes) === "10/8/26 seanf: first call");

  // Calls made before this: added once, by the migration, in the order they were made.
  const past = Number(sql(`insert into public.leads (company_name, project_id, assigned_user_id) values (${lit(`${TAG} Past`)}, ${DBDV}, ${SEAN}) returning id`));
  sql(`insert into public.lead_notes (lead_id, notes) values (${past}, 'Old system: 7-31-26 MP vm')`);
  sql(`insert into public.call_records (lead_id, project_id, user_id, call_result, notes, call_date) values
    (${past}, ${DBDV}, ${SEAN}, 'Viable-CallBack', '10/2/26 seanf: second', now() - interval '1 day'),
    (${past}, ${DBDV}, ${SEAN}, 'Viable-CallBack', '10/1/26 seanf: first', now() - interval '2 days')`);
  const migration = readFileSync(new URL("../../supabase/migrations/20261019100000_call_notes_history.sql", import.meta.url), "utf8");
  sql(migration);
  check("calls made before are added to the internal notes, oldest first",
    internal(past) === "Old system: 7-31-26 MP vm\n10/1/26 seanf: first\n10/2/26 seanf: second", internal(past));
  sql(migration);
  check("…once: running it again adds nothing", internal(past) === "Old system: 7-31-26 MP vm\n10/1/26 seanf: first\n10/2/26 seanf: second", internal(past));

  section("“Moved” only when it moved");
  await record(mike, lead, "APPT", "Appointment", { p_appointment: { date: day(3), time: "10:00 AM" } });
  check("recorded again at the same day and time, nothing is said to have moved", !/moved/.test(lastNotes(lead)), lastNotes(lead));
  await record(mike, lead, "APPT", "Appointment", { p_appointment: { date: day(3), time: "11:00 AM" } });
  check("…a new time is", /Appointment moved from .* 10:00 AM to .* 11:00 AM/.test(lastNotes(lead)), lastNotes(lead));

  section("SIC codes");
  check("every standard 4-digit code has its description",
    Number(sql("select count(*) from public.sic_codes where description is not null")) >= 1005
    && sql("select description from public.sic_codes where code='1731'") === "Electrical Work"
    && sql("select description from public.sic_codes where code='0711'") === "Soil Preparation Services");
} finally {
  sql(`update public.users set company_id=${clientCompany} where id=${CLIENT_USER}`);
  sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)} or body like ${lit(`%${TAG}%`)}`);
  const leads = `select id from public.leads where project_id in (${DBDV}, ${APPT}) or source_project_id in (${DBDV}, ${APPT})`;
  sql(`delete from public.pay_events where lead_id in (${leads})`);
  sql(`delete from public.lead_deliveries where lead_id in (${leads})`);
  sql(`delete from public.appointments where lead_id in (${leads})`);
  sql(`delete from public.call_records where lead_id in (${leads})`);
  sql(`delete from public.leads where id in (${leads})`);
  sql(`delete from public.project_assignments where project_id in (${DBDV}, ${APPT})`);
  sql(`delete from public.projects where id in (${DBDV}, ${APPT})`);
  sql(`delete from public.companies where id = ${companyId}`);
}

finish("lead sheet");
