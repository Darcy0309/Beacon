/**
 * The lead page as Sean laid it out (Oct 2026), against the database as real
 * signed-in people: the Business tab's details; sending a lead to someone to
 * call; a hot lead with nobody on the appointment project to take it; the
 * reports by call result; and policy files kept with a lead, who may add and
 * open them, and who hears.
 *
 * Removes everything it made.
 *
 *   node tests/integration/lead-rework.test.mjs
 */
import { check, finish, section, sleep } from "../support/assert.mjs";
import { adminClient, signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `LR-TEST ${Date.now()}`;
const type = (code) => sql(`select id from public.project_types where code='${code}'`);
const resultId = (t, name) => Number(sql(`select id from public.call_results where project_type='${t}' and name=${lit(name)}`));
const admin = await signIn("admin@beacon.test");
const sean = await signIn("sean@beacon.test");     // a manager
const mike = await signIn("mike@beacon.test");     // a manager
const agent = await signIn("agent@beacon.test");
const client = await signIn("client@beacon.test");
const tomorrow = sql("select ((now() at time zone public.business_tz())::date + 1)::text");

const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const other = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Other`)}) returning id`));
const APPT = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts`)}, ${company}, ${type("APPT")}, 1) returning id`));
const DBDV = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id) values (${lit(`${TAG} DBDev`)}, ${company}, ${type("DBDV")}, 1, ${APPT}) returning id`));
const THEIRS = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Theirs`)}, ${other}, ${type("APPT")}, 1) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${DBDV}, ${sean.me.id})`);
const lead = (name, project, assigned = "null") => Number(sql(`insert into public.leads (company_name, project_id, assigned_user_id, result_id)
  values (${lit(`${TAG} ${name}`)}, ${project}, ${assigned}, ${resultId(project === DBDV ? "DBDV" : "APPT", project === DBDV ? "Viable-CallBack" : "Lead-No Contact")}) returning id`));
const clientCompany = sql(`select coalesce(company_id::text, 'null') from public.users where id=${client.me.id}`);
sql(`update public.users set company_id = ${company} where id = ${client.me.id}`);
const notes = (user, like) => sql(`select string_agg(title || ' | ' || coalesce(body, ''), ' || ' order by id) from public.notifications where user_id = ${user} and title like ${lit(`%${like}%`)}`);
const paths = [];

try {
  section("The Business tab's details");
  const L = lead("Acme Wash", APPT, sean.me.id);
  const saved = await sean.sb.from("leads").update({
    location: "2", location_ownership: "lease", building_age: 15, building_stories: 2, building_acres: 1.5,
    employees: "20", employees_full_time: 15, employees_part_time: 5, subcontractors_pct: 10,
    autos: "11", auto_types: ["vans", "delivery_trucks"], travel_radius: "100", professionals: "3", covered_employees: "18",
  }).eq("id", L).select("location_ownership, building_acres, auto_types, travel_radius").single();
  check("a manager saves them all", !saved.error && saved.data.location_ownership === "lease" && Number(saved.data.building_acres) === 1.5
    && JSON.stringify(saved.data.auto_types) === JSON.stringify(["vans", "delivery_trucks"]) && saved.data.travel_radius === "100", saved.error?.message);
  check("…as an agent may too", !(await agent.sb.from("leads").update({ subcontractors_pct: 12.5 }).eq("id", L)).error && sql(`select subcontractors_pct from public.leads where id = ${L}`) === "12.50");
  for (const [what, change] of [["a share over 100%", { subcontractors_pct: 105 }], ["a kind of vehicle not on the list", { auto_types: ["boats"] }],
    ["a radius not on the list", { travel_radius: "75" }], ["a building neither owned nor leased", { location_ownership: "rent" }]]) {
    check(`${what} is refused`, Boolean((await sean.sb.from("leads").update(change).eq("id", L)).error));
  }
  const more = await sean.sb.from("leads").update({ annual_payroll: "$1.2M", dot_number: "1234567", cargo: `${TAG} Lumber`, claims_3yrs: false })
    .eq("id", L).select("annual_payroll, dot_number, cargo, claims_3yrs").single();
  check("annual payroll, DOT#, cargo and claims in the last 3 years are saved", !more.error && more.data.annual_payroll === "$1.2M"
    && more.data.dot_number === "1234567" && more.data.cargo === `${TAG} Lumber` && more.data.claims_3yrs === false, more.error?.message);
  check("a DOT# that is not digits is refused", Boolean((await sean.sb.from("leads").update({ dot_number: "12-AB" }).eq("id", L)).error));

  section("The cargo list");
  const added = await admin.sb.from("cargo_types").insert([{ name: `${TAG} Lumber` }, { name: `${TAG} Steel` }]).select("id, name");
  check("an administrator adds to it", !added.error && added.data.length === 2, added.error?.message);
  check("…a name once, whatever its case", Boolean((await admin.sb.from("cargo_types").insert({ name: `${TAG} lumber`.toUpperCase() }).select()).error));
  const read = async (who) => ((await who.sb.from("cargo_types").select("name").like("name", `${TAG}%`)).data ?? []).length;
  check("managers, agents and clients can read it, to pick from", (await read(sean)) === 2 && (await read(agent)) === 2 && (await read(client)) === 2);
  await sean.sb.from("cargo_types").insert({ name: `${TAG} Sand` });
  await sean.sb.from("cargo_types").delete().eq("id", added.data[0].id);
  check("…but only an administrator changes it", sql(`select count(*) from public.cargo_types where name like ${lit(`${TAG}%`)}`) === "2");
  check("taking a name off the list leaves the lead's cargo as it is",
    !(await admin.sb.from("cargo_types").delete().eq("id", added.data[0].id)).error && sql(`select cargo from public.leads where id = ${L}`) === `${TAG} Lumber`);

  section("Sending a lead to someone to call");
  const H = lead("Hot Lead Co", APPT, sean.me.id);
  const sent = await sean.sb.rpc("send_lead", { p_lead: H, p_to: mike.me.id, p_note: "Owner wants a quote before the 15th", p_date: tomorrow, p_time: "2:00 PM", p_assign: true });
  check("a manager sends it to another manager", !sent.error && sent.data?.assigned === true, sent.error?.message);
  check("…it is theirs to work now", sql(`select assigned_user_id from public.leads where id = ${H}`) === String(mike.me.id));
  const told = notes(mike.me.id, `${TAG} Hot Lead Co`);
  check("…they are told once, with who sent it, the time to call and the note",
    told.split(" || ").length === 1 && /^Lead to call: /.test(told) && /From Sean/.test(told) && /Call (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{2}\/\d{2}\/\d{4} 2:00 PM/.test(told) && /before the 15th/.test(told), told);
  check("…and a call-back reminder is theirs for 2:00 PM tomorrow",
    sql(`select to_char(remind_at at time zone public.business_tz(), 'YYYY-MM-DD HH24:MI') from public.reminders where lead_id = ${H} and user_id = ${mike.me.id}`) === `${tomorrow} 14:00`);
  const kept = await sean.sb.rpc("send_lead", { p_lead: H, p_to: admin.me.id, p_note: "FYI", p_assign: false });
  check("sent without handing it over, it stays where it was, and no reminder is set", !kept.error && sql(`select assigned_user_id from public.leads where id = ${H}`) === String(mike.me.id)
    && sql(`select count(*) from public.reminders where lead_id = ${H} and user_id = ${admin.me.id}`) === "0", kept.error?.message);
  check("an agent may not send one", Boolean((await agent.sb.rpc("send_lead", { p_lead: H, p_to: sean.me.id })).error));
  check("nor to a client, nor to themselves", Boolean((await sean.sb.rpc("send_lead", { p_lead: H, p_to: client.me.id })).error) && Boolean((await sean.sb.rpc("send_lead", { p_lead: H, p_to: sean.me.id })).error));
  check("a day without a time is refused", /both the day and the time/.test((await sean.sb.rpc("send_lead", { p_lead: H, p_to: mike.me.id, p_date: tomorrow })).error?.message ?? ""));

  section("A hot lead with nobody to take it");
  const D = lead("Promote Me", DBDV, sean.me.id);
  const before = Number(sql(`select count(*) from public.notifications where user_id = ${admin.me.id}`));
  const hot = await sean.sb.rpc("record_call_result", { p_lead_id: D, p_result_id: resultId("DBDV", "Lead-Hot Lead"), p_notes: null, p_appointment: null,
    p_corrected_xdate: null, p_ultimate_xdate: sql("select (current_date + 200)::text"), p_client_note: null });
  check("Lead-Hot Lead promotes it to the appointment project, where nobody is assigned", !hot.error && sql(`select project_id || '|' || coalesce(assigned_user_id::text, 'nobody') from public.leads where id = ${D}`) === `${APPT}|nobody`, hot.error?.message);
  check("…so the administrators are told it is waiting, and why", /^Hot lead waiting: .*Promote Me \| Nobody is assigned to .*Appts/.test(notes(admin.me.id, `${TAG} Promote Me`))
    && Number(sql(`select count(*) from public.notifications where user_id = ${admin.me.id}`)) === before + 1, notes(admin.me.id, `${TAG} Promote Me`));
  sql(`insert into public.project_assignments (project_id, ae_user_id) values (${APPT}, ${mike.me.id})`);
  const D2 = lead("Promote Me Too", DBDV, sean.me.id);
  await sean.sb.rpc("record_call_result", { p_lead_id: D2, p_result_id: resultId("DBDV", "Lead-Hot Lead"), p_notes: null, p_appointment: null,
    p_corrected_xdate: null, p_ultimate_xdate: sql("select (current_date + 200)::text"), p_client_note: null });
  check("with an appointment manager on the project, it goes to them, and they are told it is a hot lead",
    sql(`select assigned_user_id from public.leads where id = ${D2}`) === String(mike.me.id) && /^Hot lead assigned to you: .*Promote Me Too/.test(notes(mike.me.id, `${TAG} Promote Me Too`))
    && !notes(admin.me.id, `${TAG} Promote Me Too`), notes(mike.me.id, `${TAG} Promote Me Too`));

  section("Reports by call result");
  const report = (await admin.sb.rpc("report_stats")).data;
  check("leads are counted by call result, not by the old statuses", report && Object.keys(report.by_status).some((k) => /^Lead-|^Viable-/.test(k))
    && !Object.keys(report.by_status).some((k) => /^X-date|^Phone appointment|^New$/.test(k)), JSON.stringify(report?.by_status));

  section("Policy files");
  const F = lead("Files Co", APPT, sean.me.id);
  sql(`insert into public.appointments (lead_id, project_id, user_id, appt_date, appt_time, qa_status) values (${F}, ${APPT}, ${sean.me.id}, ${lit(tomorrow)}, '10:00 AM', 'passed')`);
  const put = async (who, leadId, name) => {
    const path = `lead/${leadId}/${crypto.randomUUID()}-${name}`;
    const up = await who.sb.storage.from("lead-files").upload(path, new Blob(["%PDF-1.4 test"], { type: "application/pdf" }), { contentType: "application/pdf" });
    if (!up.error) paths.push(path);
    return { path, up };
  };
  const mine = await put(client, F, "policy.pdf");
  check("the client's people put a file in their lead's folder", !mine.up.error, mine.up.error?.message);
  const row = await client.sb.from("documents").insert({ name: "policy.pdf", file_type: "PDF", size_bytes: 13, storage_path: mine.path, lead_id: F }).select("id, project_id, company_id, uploaded_by").single();
  check("…and record it: the lead's project, client and who added it filled in by the database",
    !row.error && row.data.project_id === APPT && row.data.company_id === company && row.data.uploaded_by === client.me.id, row.error?.message ?? JSON.stringify(row.data));
  check("…the lead's manager hears of it", /^Policy file added: .*Files Co \| policy\.pdf · from/.test(notes(sean.me.id, `Policy file added: ${TAG} Files Co`) ?? ""), notes(sean.me.id, `${TAG} Files Co`));
  const theirs = lead("Not Theirs", THEIRS);
  check("another client's lead: no file goes in its folder", Boolean((await put(client, theirs, "x.pdf")).up.error));
  check("…nor is it recorded against it", Boolean((await client.sb.from("documents").insert({ name: "x.pdf", storage_path: `lead/${theirs}/x.pdf`, lead_id: theirs })).error));
  const staffFile = await put(sean, F, "dec-page.pdf");
  await sean.sb.from("documents").insert({ name: "dec-page.pdf", file_type: "PDF", size_bytes: 13, storage_path: staffFile.path, lead_id: F });
  await sleep(200);
  check("staff add one to a lead with an appointment: the client's people hear, pointed at the appointment",
    /^Policy file added: .*Files Co \| dec-page\.pdf · for the appointment on (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{2}\/\d{2}\/\d{4} 10:00 AM/.test(notes(client.me.id, `Policy file added: ${TAG} Files Co`) ?? "")
    && sql(`select link from public.notifications where user_id = ${client.me.id} and title like ${lit(`Policy file added: ${TAG} Files Co%`)} order by id desc limit 1`).startsWith("/calendar?view=day&d="), notes(client.me.id, `${TAG} Files Co`));
  check("…not the person who added it", !notes(sean.me.id, `Policy file added: ${TAG} Files Co`).includes("dec-page.pdf"));
  const listed = await client.sb.from("documents").select("name").eq("lead_id", F).order("id");
  check("the client sees both files on the lead", JSON.stringify((listed.data ?? []).map((d) => d.name)) === JSON.stringify(["policy.pdf", "dec-page.pdf"]), JSON.stringify(listed.data));
  const link = await client.sb.storage.from("lead-files").createSignedUrl(staffFile.path, 60);
  check("…and can open one", Boolean(link.data?.signedUrl), link.error?.message);
  sql(`update public.users set company_id = ${other} where id = ${client.me.id}`);
  const shut = await client.sb.storage.from("lead-files").createSignedUrl(staffFile.path, 60);
  check("someone of another client cannot open it", !shut.data?.signedUrl);
} finally {
  sql(`update public.users set company_id = ${clientCompany} where id = ${client.me.id}`);
  // Stored files go through the storage service, which removes the file with its row.
  if (paths.length) await adminClient().storage.from("lead-files").remove(paths);
  sql(`delete from public.documents where lead_id in (select id from public.leads where company_name like ${lit(`${TAG}%`)})`);
  sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.appointments where lead_id in (select id from public.leads where company_name like ${lit(`${TAG}%`)})`);
  sql(`delete from public.leads where company_name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.projects where name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.companies where id in (${company}, ${other})`);
  sql(`delete from public.cargo_types where name ilike ${lit(`${TAG}%`)}`);
}

finish("lead rework");
