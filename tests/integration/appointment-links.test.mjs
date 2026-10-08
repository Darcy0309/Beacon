/**
 * "Open calendar" on an appointment notification names the appointment
 * (&a=<id>), so the calendar can highlight it: for staff, for the client,
 * and, once the migration has run, for notifications sent before it.
 *
 * Works on its own project under the demo client's company and removes
 * everything it made.
 *
 *   npm run test:integration
 */
import { readFileSync } from "node:fs";
import { check, finish, section } from "../support/assert.mjs";
import { sql, lit } from "../support/db.mjs";
import { ROOT } from "../support/env.mjs";

const TAG = `AL-TEST ${Date.now()}`;
const DAY = "2031-03-04";
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const ADMIN = userId("admin@beacon.test");
const CLIENT = userId("client@beacon.test");
const SEAN = userId("sean@beacon.test");
const companyId = Number(sql(`select company_id from public.users where id = ${CLIENT}`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} Appt`)}, ${companyId}, (select id from public.project_types where code='APPT'), 1) returning id`));
const lead = (co) => Number(sql(`insert into public.leads (company_name, project_id) values (${lit(`${TAG} ${co}`)}, ${project}) returning id`));
const appt = (leadId, time) => Number(sql(`insert into public.appointments (lead_id, user_id, appt_date, appt_time, status_id)
  values (${leadId}, ${SEAN}, ${lit(DAY)}, ${lit(time)}, (select id from public.appointment_statuses where name='Scheduled')) returning id`));
const linkOf = (user, titleLike) => sql(`select link from public.notifications where user_id = ${user}
  and title like ${lit(titleLike)} order by id desc limit 1`);

try {
  section("New appointments");
  const first = appt(lead("Harbor Tile"), "10:00 AM");
  check("staff are pointed at the appointment itself",
    linkOf(ADMIN, `Appointment set: ${TAG} Harbor Tile`) === `/calendar?view=day&d=${DAY}&a=${first}`, linkOf(ADMIN, `%${TAG} Harbor Tile`));
  check("…and so is the client", linkOf(CLIENT, `Appointment set: ${TAG} Harbor Tile`) === `/calendar?view=day&d=${DAY}&a=${first}`);
  sql(`select public.notify_client_appointment(${first}, true, false)`);
  check("the client's “Appointment confirmed” too",
    linkOf(CLIENT, `Appointment confirmed: ${TAG} Harbor Tile`) === `/calendar?view=day&d=${DAY}&a=${first}`);

  section("Notifications sent before");
  // Two at the same company on the day: the time in the notification tells them apart.
  const twin = lead("Twin Oaks");
  const morning = appt(twin, "9:00 AM");
  const afternoon = appt(twin, "2:00 PM");
  const old = (body) => Number(sql(`insert into public.notifications (user_id, kind, title, body, link)
    values (${ADMIN}, 'appointment', ${lit(`Appointment set: ${TAG} Twin Oaks`)}, ${lit(body)}, ${lit(`/calendar?view=day&d=${DAY}`)}) returning id`));
  const a = old(`Tue Mar 4 at 2:00 PM · ${TAG}`);
  const b = old(`Tue Mar 4 at 9:00 AM · ${TAG}`);
  const gone = Number(sql(`insert into public.notifications (user_id, kind, title, body, link)
    values (${ADMIN}, 'appointment', ${lit(`Appointment set: ${TAG} Long Gone`)}, ${lit(TAG)}, ${lit(`/calendar?view=day&d=${DAY}`)}) returning id`));
  sql(readFileSync(`${ROOT}/supabase/migrations/20261016100000_appointment_links.sql`, "utf8"));
  const link = (id) => sql(`select link from public.notifications where id = ${id}`);
  check("each gets its own appointment, told apart by the time",
    link(a) === `/calendar?view=day&d=${DAY}&a=${afternoon}` && link(b) === `/calendar?view=day&d=${DAY}&a=${morning}`, `${link(a)} ${link(b)}`);
  check("one whose appointment is gone keeps the day", link(gone) === `/calendar?view=day&d=${DAY}`);
  sql(readFileSync(`${ROOT}/supabase/migrations/20261016100000_appointment_links.sql`, "utf8"));
  check("running the migration again changes nothing", link(a) === `/calendar?view=day&d=${DAY}&a=${afternoon}`);
} finally {
  sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)} or body like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.appointments where lead_id in (select id from public.leads where project_id = ${project})`);
  sql(`delete from public.leads where project_id = ${project}`);
  sql(`delete from public.projects where id = ${project}`);
}

finish("appointment links");
