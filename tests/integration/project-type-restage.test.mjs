/**
 * A project's type and its names' stage stay together: an administrator
 * changing a project from Database Development to Appointment Setting (and
 * back) moves its names to that stage, and a result from the other stage's
 * list starts again at the stage's first, so a name's sheet offers results
 * that fit it.
 *
 * Removes everything it made.
 *
 *   node tests/integration/project-type-restage.test.mjs
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `RESTAGE-TEST ${Date.now()}`;
const type = (code) => Number(sql(`select id from public.project_types where code = ${lit(code)}`));
const admin = await signIn("admin@beacon.test");
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Co`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} DBDev`)}, ${company}, ${type("DBDV")}, 1) returning id`));
const lead = Number(sql(`insert into public.leads (project_id, company_name, result_id) values (${project}, ${lit(`${TAG} Plumbing`)},
  (select id from public.call_results where project_type = 'DBDV' and name = 'Viable-CallBack')) returning id`));
const state = () => sql(`select l.stage || ' / ' || r.name from public.leads l join public.call_results r on r.id = l.result_id where l.id = ${lead}`);

try {
  section("Changing a project's type");
  check("a name loaded into a DB dev project: DB dev stage, Viable-CallBack", state() === "dbdev / Viable-CallBack", state());
  const toAppt = await admin.sb.from("projects").update({ project_type_id: type("APPT") }).eq("id", project).select("id");
  check("set to Appointment Setting: its names move to the appointment stage, starting at Lead-No Contact",
    !toAppt.error && state() === "appt / Lead-No Contact", toAppt.error?.message ?? state());
  const back = await admin.sb.from("projects").update({ project_type_id: type("DBDV") }).eq("id", project).select("id");
  check("…and back to Database Development: the DB dev stage, starting at Viable-CallBack",
    !back.error && state() === "dbdev / Viable-CallBack", back.error?.message ?? state());
  const same = await admin.sb.from("projects").update({ name: `${TAG} DBDev renamed` }).eq("id", project).select("id");
  check("saving the project without changing its type leaves its names alone", !same.error && state() === "dbdev / Viable-CallBack", state());
} finally {
  sql(`delete from public.leads where id = ${lead}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("project type restage");
