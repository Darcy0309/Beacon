/**
 * Valid-Not Updated (Sean, Oct 29 and Nov 2026): an appointment held whose update's due date (5 business days after it)
 * has passed with no status is made Valid-Not Updated by mark_appointments_not_updated(), every hour: kept in its
 * update history, and the client's Sales Rep told of one due in the last week (an older one quietly). Not one found
 * invalid, nor one still waiting for QA, nor one not yet due, nor one the client updated. The client can still give it
 * a status afterwards; the client dashboard counts it.
 *
 * Removes everything it made.
 *
 *   node tests/integration/valid-not-updated.test.mjs
 */
import { check, finish, section } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `VNU-TEST ${Date.now()}`;
const MIKE = 3;
const company = Number(sql(`insert into public.companies (name, sales_rep_id) values (${lit(`${TAG} Co`)}, ${MIKE}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} Appts`)}, ${company}, (select id from public.project_types where code = 'APPT'), 1) returning id`));
const today = sql(`select public.business_today()`);
/** A day the given number of days before today, as the business counts it. */
const ago = (n) => sql(`select (public.business_today() - ${n})::text`);
const appt = (name, day, extra = {}) => {
  const lead = Number(sql(`insert into public.leads (company_name, project_id, stage) values (${lit(`${TAG} ${name}`)}, ${project}, 'appt') returning id`));
  return Number(sql(`insert into public.appointments (lead_id, project_id, appt_date, appt_time, status_id, qa_status, invalid_at, client_result)
    values (${lead}, ${project}, ${lit(day)}, '10:00 AM', (select id from public.appointment_statuses where name = ${lit(extra.status ?? "Scheduled")}),
            ${lit(extra.qa ?? "passed")}, ${extra.invalid ? "now()" : "null"}, ${extra.result ? lit(extra.result) : "null"}) returning id`));
};
const result = (id) => sql(`select coalesce(client_result, '') from public.appointments where id = ${id}`);
const told = () => Number(sql(`select count(*) from public.notifications where user_id = ${MIKE} and title like ${lit(`Not updated by the due date · ${TAG}%`)}`));

try {
  // Due 5 business days after: 10 days ago is due about 3 days ago; 40 days ago, long past.
  const recent = appt("Recent", ago(10));
  const old = appt("Old", ago(40));
  const invalid = appt("Invalid", ago(10), { status: "Invalid", invalid: true });
  const qa = appt("In QA", ago(10), { qa: "pending" });
  const notYet = appt("Not yet due", ago(2));
  const sold = appt("Updated", ago(10), { result: "sold" });

  section("Past its due date with no status: Valid-Not Updated");
  const n = Number(sql(`select public.mark_appointments_not_updated()`));
  check("the one just past its due date and the one long past", result(recent) === "valid_not_updated" && result(old) === "valid_not_updated", `${result(recent)} / ${result(old)}`);
  check("…kept in its update history: from No Status, why, by no one", sql(`select concat_ws('|', previous_status, note, coalesce(created_by::text, 'system'))
    from public.appointment_updates where appointment_id = ${recent}`).startsWith("no_status|Not updated by the due date, "),
    sql(`select concat_ws('|', previous_status, note, coalesce(created_by::text, 'system')) from public.appointment_updates where appointment_id = ${recent}`));
  check("…the Sales Rep told of the recent one, not the old one", told() === 1, `${told()} notifications`);
  check("…shown as Valid-Not Updated", sql(`select public.appointment_update_label('valid_not_updated')`) === "Valid-Not Updated");

  section("Left alone");
  check("found invalid (no update asked for)", result(invalid) === "");
  check("still waiting for QA (the client hasn't seen it)", result(qa) === "");
  check("not yet due", result(notYet) === "" && sql(`select public.update_due_on(${lit(ago(2))}) >= ${lit(today)}::date`) === "t");
  check("updated by the client", result(sold) === "sold");
  check("…and these were all (the test's own) of the ones it changed", n >= 2, `${n} changed`);

  section("Once only, and still the client's to update");
  sql(`select public.mark_appointments_not_updated()`);
  check("run again: nothing more, no second notice", Number(sql(`select count(*) from public.appointment_updates where appointment_id = ${recent}`)) === 1 && told() === 1);
  sql(`update public.appointments set client_result = 'valid_quoting' where id = ${recent}`);
  sql(`select public.mark_appointments_not_updated()`);
  check("given a status afterwards, it keeps it", result(recent) === "valid_quoting");
} finally {
  sql(`delete from public.notifications where title like ${lit(`Not updated by the due date · ${TAG}%`)}`);
  sql(`delete from public.appointment_updates where company_id = ${company}`);
  sql(`delete from public.appointments where project_id = ${project}`);
  sql(`delete from public.leads where project_id = ${project}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}
finish("valid not updated");
