/**
 * The Match Tool (Sean, Nov 2026): a name on a project's list we already have
 * elsewhere with a renewal date, by phone or by name in the same place; never
 * one with renewal dates of its own, one no longer viable, or a record on the
 * project's own family. Brought to DB Dev: its renewal dates on the name's
 * lines (brought round to their next time), no Ultimate X-date, Viable-Staged.
 * To the appointment project: a lead with its Ultimate X-date, Lead-No
 * Contact. Either way matched, counted toward the goal, never as developed,
 * nobody paid. Administrators only.
 *
 * Removes everything it made.
 *
 *   node tests/integration/match-tool.test.mjs
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `MT-TEST ${Date.now()}`;
const type = (code) => sql(`select id from public.project_types where code = '${code}'`);
const company = (name) => Number(sql(`insert into public.companies (name) values (${lit(`${TAG} ${name}`)}) returning id`));
const C1 = company("Client"), C2 = company("Other");
const PA = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Appts`)}, ${C1}, ${type("APPT")}, 1) returning id`));
const P = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id, lead_goal, start_date, end_date)
  values (${lit(`${TAG} DBDev`)}, ${C1}, ${type("DBDV")}, 1, ${PA}, 10, current_date - 30, current_date + 60) returning id`));
const Q = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} Old`)}, ${C2}, ${type("APPT")}, 4) returning id`));
const lead = (project, name, f = {}, ins = null) => {
  const cols = { company_name: `${TAG} ${name}`, project_id: project, ...f };
  const id = Number(sql(`insert into public.leads (${Object.keys(cols).join(", ")}) values (${Object.values(cols).map((v) => (typeof v === "number" ? v : lit(v))).join(", ")}) returning id`));
  if (ins) sql(`insert into public.insurance_details (lead_id, ${Object.keys(ins).join(", ")}) values (${id}, ${Object.values(ins).map(lit).join(", ")})`);
  return id;
};
// Elsewhere, with renewal dates: another client's old project.
const S1 = lead(Q, "Acme Plumbing Inc", { phone: "602-555-1001", zip: "85016", city: "Phoenix", state: "AZ" }, { wc_xdate: "2025-03-01", wc_carrier: "Amtrust Ins Co", ultimate_xdate: "2025-03-01" });
const S2 = lead(Q, "Best Roofing, LLC", { phone: "602-555-1002", zip: "85099", city: "Phoenix", state: "AZ" }, { pkg_xdate: "2024-12-20", pkg_carrier: "West Bend Ins Co" });
lead(Q, "Gamma Co", { phone: "602-555-1003", city: "Mesa", state: "AZ" });
// The project's list.
const T1 = lead(P, "Acme Plumbing", { phone: "(602) 555-1001", city: "Tempe", state: "AZ" });
const T2 = lead(P, "Best Roofing", { phone: "602-555-9999", zip: "85001", city: "Phoenix", state: "AZ" });
const T3 = lead(P, "Gamma Co", { phone: "602-555-1003", city: "Mesa", state: "AZ" });
lead(P, "Delta Signs", { phone: "602-555-1001" }, { wc_xdate: "2027-01-01" });
lead(P, "Acme Plumbing Two", { phone: "602-555-1001", result_id: Number(sql("select id from public.call_results where project_type = 'DBDV' and name = 'DoNotCall'")) });
// A record of Gamma's on the project's own appointment project: not a source.
lead(PA, "Gamma Co Again", { phone: "602-555-1003" }, { wc_xdate: "2025-06-01" });

const admin = await signIn("admin@beacon.test");
const manager = await signIn("sean@beacon.test");
const next = (d) => sql(`select public.next_renewal('${d}', (now() at time zone public.business_tz())::date)`);
const leadRow = (id) => JSON.parse(sql(`select row_to_json(x) from (select l.project_id, l.stage, l.source_project_id, l.dbdv_user_id, l.promoted_at is not null as promoted,
  l.matched_at is not null as matched, l.matched_from_lead_id, r.name as result, i.ultimate_xdate, i.wc_xdate, i.wc_carrier, i.pkg_xdate, i.pkg_carrier
  from public.leads l join public.call_results r on r.id = l.result_id left join public.insurance_details i on i.lead_id = l.id where l.id = ${id}) x`));

try {
  section("A project's matches");
  const { data, error } = await admin.sb.rpc("project_matches", { p_project: P });
  const got = Object.fromEntries((data ?? []).map((m) => [m.lead_id, m]));
  check("only the names we have elsewhere with a renewal date", !error && JSON.stringify(Object.keys(got).map(Number).sort()) === JSON.stringify([T1, T2].sort()), error?.message ?? JSON.stringify(data));
  check("…by phone", got[T1]?.source_lead_id === S1 && got[T1]?.matched_by === "phone" && got[T1]?.source_client === `${TAG} Other`, JSON.stringify(got[T1]));
  check("…or by name in the same place (LLC and the comma aside; the city and state when the ZIP differs)", got[T2]?.source_lead_id === S2 && got[T2]?.matched_by === "name", JSON.stringify(got[T2]));
  check("…the renewal its next time round", got[T1]?.renewal === next("2025-03-01") && got[T2]?.renewal === next("2024-12-20"), `${got[T1]?.renewal} ${got[T2]?.renewal}`);
  check("not one with renewal dates of its own, one no longer viable, or one found only on its own family", !got[T3]);

  check("a business name as the import reads it", sql("select concat_ws('|', public.business_key('The Acme Plumbing, Inc.'), public.business_key('Acme Plumbing Co'), public.business_key('A & J Electric LLC'))") === "acmeplumbing|acmeplumbing|aandjelectric");

  section("The Match report");
  const sum = await admin.sb.rpc("match_summary");
  const row = (sum.data ?? []).find((r) => Number(r.project_id) === P);
  check("each active project: its goal, its matches by renewal month", !sum.error && row?.lead_goal === 10 && Number(row.matches) === 2
    && JSON.stringify(Object.fromEntries(Object.entries(row.by_month).sort())) === JSON.stringify({ 12: 1, 3: 1 }), sum.error?.message ?? JSON.stringify(row));

  section("Bringing them in");
  const toDbdev = await admin.sb.rpc("add_matches", { p_project: P, p_leads: [T1], p_to: "dbdev" });
  const a = leadRow(T1);
  check("to DB Dev: its renewal dates on its lines, no Ultimate X-date, Viable-Staged, matched", !toDbdev.error && toDbdev.data === 1 && a.project_id === P && a.result === "Viable-Staged"
    && a.wc_xdate === next("2025-03-01") && a.wc_carrier === "Amtrust Ins Co" && a.ultimate_xdate === null && a.matched && a.matched_from_lead_id === S1 && !a.promoted, toDbdev.error?.message ?? JSON.stringify(a));
  const toAppt = await admin.sb.rpc("add_matches", { p_project: P, p_leads: [T2, T3], p_to: "appt" });
  const b = leadRow(T2);
  check("to the appointment project: a lead with its Ultimate X-date, at Lead-No Contact, nobody's developed one", !toAppt.error && toAppt.data === 1 && b.project_id === PA && b.stage === "appt"
    && b.source_project_id === P && b.result === "Lead-No Contact" && b.promoted && b.dbdv_user_id === null && b.ultimate_xdate === next("2024-12-20")
    && b.pkg_xdate === next("2024-12-20") && b.pkg_carrier === "West Bend Ins Co" && b.matched, toAppt.error?.message ?? JSON.stringify(b));
  check("…a name that is no match left as it was", leadRow(T3).matched === false && leadRow(T3).project_id === P);
  check("…and nobody paid", sql(`select count(*) from public.pay_events where lead_id in (${T1}, ${T2})`) === "0");
  const again = await admin.sb.rpc("add_matches", { p_project: P, p_leads: [T1], p_to: "appt" });
  check("a name matched already is not matched again", !again.error && again.data === 0, again.error?.message ?? again.data);

  section("Counted toward the goal, never as developed");
  const after = (await admin.sb.rpc("match_summary")).data?.find((r) => Number(r.project_id) === P);
  check("the report: 1 lead in (the match sent on), 0 developed, 2 matches added, none left", Number(after?.leads) === 1 && Number(after?.developed) === 0 && Number(after?.matched) === 2 && Number(after?.matches) === 0, JSON.stringify(after));
  const today = sql("select (now() at time zone public.business_tz())::date");
  const counts = await admin.sb.rpc("report_counts", { p_from: today, p_to: today });
  check("…and the administrators' Reports don't count it a developed lead", !counts.error && !(counts.data ?? []).some((r) => [P, PA].includes(Number(r.project_id)) && Number(r.leads) > 0), counts.error?.message);

  section("Administrators only");
  for (const [fn, args] of [["project_matches", { p_project: P }], ["match_summary", {}], ["add_matches", { p_project: P, p_leads: [T3], p_to: "dbdev" }]]) {
    const r = await manager.sb.rpc(fn, args);
    check(`${fn}: a manager is refused`, r.error?.code === "42501", r.error?.message ?? "allowed");
  }
} finally {
  const like = lit(`${TAG}%`);
  sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)} or body like ${lit(`%${TAG}%`)}`);
  sql(`update public.leads set matched_from_lead_id = null where company_name like ${like}`);
  sql(`delete from public.insurance_details where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.leads where company_name like ${like}`);
  sql(`update public.projects set appt_project_id = null where id = ${P}`);
  sql(`delete from public.projects where id in (${P}, ${PA}, ${Q})`);
  sql(`delete from public.companies where id in (${C1}, ${C2})`);
}

finish("match tool");
