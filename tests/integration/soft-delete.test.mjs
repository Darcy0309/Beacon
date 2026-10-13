/**
 * Deleting sets a flag (Oct 2026): a record a person deletes keeps its row,
 * marked with when and by whom, and is hidden from everyone signed in; what
 * belongs to it goes with it and comes back with it; an administrator sees
 * what was deleted and restores it. Against the database as real signed-in
 * people.
 *
 * Removes everything it made.
 *
 *   node tests/integration/soft-delete.test.mjs
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `SD-TEST ${Date.now()}`;
const type = (code) => sql(`select id from public.project_types where code='${code}'`);
const result = (t, name) => Number(sql(`select id from public.call_results where project_type='${t}' and name=${lit(name)}`));
const admin = await signIn("admin@beacon.test");
const sean = await signIn("sean@beacon.test");       // a manager
const agent = await signIn("agent@beacon.test");
const client = await signIn("client@beacon.test");

const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts`)}, ${company}, ${type("APPT")}, 1) returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id) values (${lit(`${TAG} DBDev`)}, ${company}, ${type("DBDV")}, 1, ${APPT}) returning id`));
const lead = (name, project, extra = "") => Number(sql(`insert into public.leads (company_name, project_id, result_id ${extra ? ", assigned_user_id" : ""})
  values (${lit(`${TAG} ${name}`)}, ${project}, ${result(project === APPT ? "APPT" : "DBDV", project === APPT ? "Lead-No Contact" : "Viable-CallBack")} ${extra}) returning id`));
const A = lead("Alpha", DBDV, `, ${agent.me.id}`);
const B = lead("Bravo", DBDV);
const C = lead("Charlie", APPT);
const appt = Number(sql(`insert into public.appointments (lead_id, project_id, appt_date, appt_time) values (${C}, ${APPT}, current_date + 3, '10:00 AM') returning id`));
sql(`insert into public.call_records (lead_id, project_id, user_id, call_result) values (${A}, ${DBDV}, ${agent.me.id}, 'Viable-CallBack')`);
sql(`insert into public.lead_notes (lead_id, notes) values (${A}, 'kept')`);
sql(`insert into public.reminders (lead_id, user_id, remind_at, note) values (${A}, ${agent.me.id}, now() - interval '1 minute', ${lit(TAG)})`);
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${DBDV}, ${agent.me.id})`);
const seanName = sql(`select concat_ws(' ', first_name, last_name) from public.users where id = ${sean.me.id}`);
const callList = async () => ((await agent.sb.rpc("call_list", { p_project_id: DBDV, p_rep: null, p_limit: 50, p_offset: 0, p_search: null, p_filtered: false })).data ?? []).map((r) => Number(r.id));
const clientCompany = sql(`select coalesce(company_id::text, 'null') from public.users where id=${client.me.id}`);
sql(`update public.users set company_id = ${company} where id = ${client.me.id}`);

const row = (table, id) => sql(`select coalesce(to_char(deleted_at, 'YYYY'), 'live') || '|' || coalesce(deleted_by::text, '') || '|' || coalesce(deleted_via, '') from public.${table} where id = ${id}`);
const sees = async (who, table, id) => ((await who.sb.from(table).select("id").eq("id", id)).data ?? []).length === 1;
const remove = (who, table, id) => who.sb.rpc("remove_record", { p_table: table, p_id: id });
const year = String(new Date().getUTCFullYear());

try {
  section("Deleting a lead");
  check("before: the agent sees and can work it", (await sees(agent, "leads", A)) && (await agent.sb.rpc("can_work_lead", { p_lead_id: A })).data === true);
  const listBefore = await callList();
  const gone = await remove(sean, "leads", A);
  check("a manager deletes it", gone.data === true, gone.error?.message);
  check("the row is still there, marked with when and by whom", row("leads", A) === `${year}|${sean.me.id}|`, row("leads", A));
  check("…with its calls and notes", sql(`select (select count(*) from public.call_records where lead_id=${A}) || '|' || (select notes from public.lead_notes where lead_id=${A})`) === "1|kept");
  check("nobody signed in sees it any more: not the manager, the agent or an administrator", !(await sees(sean, "leads", A)) && !(await sees(agent, "leads", A)) && !(await sees(admin, "leads", A)));
  check("…nor can it be worked", (await agent.sb.rpc("can_work_lead", { p_lead_id: A })).data === false);
  const listAfter = await callList();
  check("…it is off the call list", listBefore.includes(A) && !listAfter.includes(A) && listAfter.length === listBefore.length - 1, `${JSON.stringify(listBefore)} → ${JSON.stringify(listAfter)}`);
  const stats = await admin.sb.rpc("lead_stats", { p_project_id: DBDV });
  check("…and out of the project's counts", !stats.error && Number(stats.data?.[0]?.names) === 1, JSON.stringify(stats.data ?? stats.error?.message));
  sql("select public.deliver_reminders()");
  check("its call-back reminder is not delivered", sql(`select count(*) from public.reminders where note = ${lit(TAG)} and sent_at is null`) === "1");
  check("deleting it again deletes nothing", (await remove(sean, "leads", A)).data === false);
  const direct = await sean.sb.from("leads").delete().eq("id", B).select("id");
  check("a plain delete through the API sets the flag too, and removes no row", !direct.error && (direct.data ?? []).length === 0 && row("leads", B).startsWith(year) && !(await sees(sean, "leads", B)), direct.error?.message ?? row("leads", B));
  const forge = await sean.sb.from("leads").update({ deleted_at: new Date().toISOString() }).eq("id", C).select("id");
  check("nobody sets the flag by hand", Boolean(forge.error) && row("leads", C) === "live||", forge.error?.message ?? row("leads", C));
  sql(`update public.leads set deleted_at = null, deleted_by = null where id = ${B}`);

  section("Who may delete");
  check("a client cannot delete a lead of theirs", (await sees(client, "leads", C)) && (await remove(client, "leads", C)).data === false && row("leads", C) === "live||");
  check("an agent cannot delete a project", (await remove(agent, "projects", DBDV)).data === false && row("projects", DBDV) === "live||");
  const other = await remove(sean, "call_records", 1);
  check("only the kinds of record that are deleted this way", Boolean(other.error), other.error?.message);

  section("What was deleted, and bringing it back");
  const seen = await admin.sb.rpc("deleted_records");
  const mine = (seen.data ?? []).find((r) => r.kind === "leads" && Number(r.id) === A);
  check("an administrator sees it listed: what, where from, by whom", mine?.name === `${TAG} Alpha` && mine.detail === `${TAG} DBDev` && mine.deleted_by === seanName, JSON.stringify(mine ?? seen.error?.message));
  check("a manager sees no such list, and cannot restore", ((await sean.sb.rpc("deleted_records")).data ?? []).length === 0 && Boolean((await sean.sb.rpc("restore_record", { p_table: "leads", p_id: A })).error) && row("leads", A).startsWith(year));
  const back = await admin.sb.rpc("restore_record", { p_table: "leads", p_id: A });
  check("the administrator restores it: seen and worked again", back.data === true && row("leads", A) === "live||" && (await sees(agent, "leads", A)) && (await agent.sb.rpc("can_work_lead", { p_lead_id: A })).data === true, back.error?.message);
  check("restoring what is not deleted restores nothing", (await admin.sb.rpc("restore_record", { p_table: "leads", p_id: A })).data === false);
  sql("select public.deliver_reminders()");
  check("its reminder is delivered now", sql(`select count(*) from public.reminders where note = ${lit(TAG)} and sent_at is not null`) === "1");

  section("A project, with its leads");
  sql(`update public.leads set deleted_at = now() - interval '1 day', deleted_by = ${sean.me.id} where id = ${B}`);   // Bravo was deleted on its own, earlier
  const held = await remove(sean, "projects", APPT);
  check("an appointment project a DB dev project promotes to is not deleted from under it, and says why", Boolean(held.error) && /promotes its leads to this project/.test(held.error.message) && row("projects", APPT) === "live||", held.error?.message);
  const proj = await remove(sean, "projects", DBDV);
  check("a manager deletes the DB dev project", proj.data === true && row("projects", DBDV) === `${year}|${sean.me.id}|`, proj.error?.message);
  check("its leads go with it, marked as its", row("leads", A) === `${year}|${sean.me.id}|projects:${DBDV}`, row("leads", A));
  check("…one deleted before it keeps its own mark", row("leads", B) === `${year}|${sean.me.id}|`);
  check("nothing of it is seen: the project, its leads; the other project and its lead are", !(await sees(admin, "projects", DBDV)) && !(await sees(admin, "leads", A)) && (await sees(admin, "projects", APPT)) && (await sees(admin, "leads", C)));
  check("…and it is off the client's own projects", !(await sees(client, "projects", DBDV)) && (await sees(client, "projects", APPT)));
  const listed = ((await admin.sb.rpc("deleted_records")).data ?? []).filter((r) => r.name?.startsWith(TAG));
  check("the list has the project (with 1 record that went with it) and the lead deleted on its own, not the lead that went with the project",
    JSON.stringify(listed.map((r) => `${r.kind}:${r.id}:${r.also}`).sort()) === JSON.stringify([`leads:${B}:0`, `projects:${DBDV}:1`].sort()), JSON.stringify(listed));
  const early = await admin.sb.rpc("restore_record", { p_table: "leads", p_id: B });
  check("a lead is not restored while its project is deleted", Boolean(early.error) && /Restore the project first/.test(early.error.message), early.error?.message);
  check("a lead that went with a project is not restored on its own", (await admin.sb.rpc("restore_record", { p_table: "leads", p_id: A })).error !== null || row("leads", A).startsWith(year));
  const projBack = await admin.sb.rpc("restore_record", { p_table: "projects", p_id: DBDV });
  check("restoring the project brings back the leads that went with it, not the one deleted before", projBack.data === true && row("projects", DBDV) === "live||" && row("leads", A) === "live||" && row("leads", B).startsWith(year), projBack.error?.message);
  sql(`update public.leads set deleted_at = null, deleted_by = null where id = ${B}`);

  section("A client, with everything of theirs");
  const co = await remove(sean, "companies", company);
  check("a manager deletes the client", co.data === true && row("companies", company) === `${year}|${sean.me.id}|`, co.error?.message);
  check("its projects, their leads and their appointments go with it", [row("projects", APPT), row("projects", DBDV), row("leads", A), row("leads", C), row("appointments", appt)].every((r) => r === `${year}|${sean.me.id}|companies:${company}`),
    [row("projects", APPT), row("leads", C), row("appointments", appt)].join(" "));
  check("the client's own people see none of it", !(await sees(client, "companies", company)) && !(await sees(client, "projects", APPT)) && !(await sees(client, "leads", C)) && !(await sees(client, "appointments", appt)));
  check("the calls made are kept as they were", sql(`select count(*) from public.call_records where lead_id = ${A}`) === "1");
  const coBack = await admin.sb.rpc("restore_record", { p_table: "companies", p_id: company });
  check("restoring the client restores all of it", coBack.data === true && [row("companies", company), row("projects", APPT), row("projects", DBDV), row("leads", A), row("leads", C), row("appointments", appt)].every((r) => r === "live||"), coBack.error?.message);
  check("…for its people too", (await sees(client, "projects", APPT)) && (await sees(client, "leads", C)));

  section("An appointment, an insurance company");
  check("deleting a lead takes its appointment; restoring it brings the appointment back",
    (await remove(sean, "leads", C)).data === true && row("appointments", appt) === `${year}|${sean.me.id}|leads:${C}` && !(await sees(sean, "appointments", appt))
    && (await admin.sb.rpc("restore_record", { p_table: "leads", p_id: C })).data === true && row("appointments", appt) === "live||");
  const agency = Number(sql(`insert into public.agencies (name) values (${lit(`${TAG} Mutual`)}) returning id`));
  check("an insurance company is flagged the same way", (await remove(sean, "agencies", agency)).data === true && row("agencies", agency).startsWith(year) && !(await sees(admin, "agencies", agency))
    && (await admin.sb.rpc("restore_record", { p_table: "agencies", p_id: agency })).data === true && (await sees(admin, "agencies", agency)));

  section("The database's own roles still remove rows");
  sql(`delete from public.agencies where id = ${agency}`);
  check("a migration, the reset script or the SQL editor deletes for real", sql(`select count(*) from public.agencies where id = ${agency}`) === "0");
} finally {
  sql(`update public.users set company_id = ${clientCompany} where id = ${client.me.id}`);
  sql(`delete from public.notifications where link in ('/leads/${A}')`);
  sql(`delete from public.appointments where id = ${appt}`);
  sql(`delete from public.leads where company_name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.projects where name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.companies where name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.agencies where name like ${lit(`${TAG}%`)}`);
}

finish("soft delete");
