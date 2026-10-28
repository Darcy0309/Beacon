/**
 * Test arrangements shared by several tests.
 */
import { sql, lit } from "./db.mjs";

/**
 * A manager and another person on one project of their own, for as long as a
 * test needs (Oct 2026: a manager messages only the clients and agents on
 * their projects). Returns what puts it all back, the administrators' copies
 * of messages titled `copies` included.
 */
export function onSameProject(managerId, userId, tag = `SAME-PROJECT ${Date.now()}`) {
  const company = Number(sql(`insert into public.companies (name) values (${lit(`${tag} Insurance`)}) returning id`));
  const project = Number(sql(`insert into public.projects (company_id, name, project_type_id, status_id)
    values (${company}, ${lit(`${tag} Appts`)}, (select id from public.project_types where code='APPT'), 1) returning id`));
  sql(`insert into public.project_assignments (project_id, ae_user_id) values (${project}, ${Number(managerId)}), (${project}, ${Number(userId)})`);
  return (copies = null) => {
    if (copies) sql(`delete from public.notifications where title like ${lit(`[Copy] ${copies}%`)}`);
    sql(`delete from public.project_assignments where project_id = ${project}`);
    sql(`delete from public.projects where id = ${project}`);
    sql(`delete from public.companies where id = ${company}`);
  };
}
