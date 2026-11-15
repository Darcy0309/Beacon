/**
 * Deleting a lead project, and the names it sent on (Sean, Nov 2026): its delete box offers to take the names it
 * sent to its appointment project with it, saying how many; ticked, only those go (as leads or appointments, with
 * their appointments), not the names another lead project sent there; not ticked, they stay, as before.
 * Restoring the project brings them back. Removes what it made.
 *
 *   node tests/run.mjs tests/e2e/delete-sent-names.test.mjs
 */
import { check, finish, section, until } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const TAG = `DSN ${Date.now()}`;
const typeId = (code) => sql(`select id from public.project_types where code=${lit(code)}`);
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const project = (name, type, appt = null) => Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id, appt_project_id)
  values (${lit(`${TAG} ${name}`)}, ${company}, ${typeId(type)}, 1, ${appt ?? "null"}) returning id`));
const APPT = project("Appts", "APPT");
const A = project("List A DBDev", "DBDV", APPT);
const B = project("List B DBDev", "DBDV", APPT);
const lead = (name, on, from = null) => Number(sql(`insert into public.leads (company_name, project_id, source_project_id, stage)
  values (${lit(`${TAG} ${name}`)}, ${on}, ${from ?? "null"}, ${on === APPT ? "'appt'" : "'dbdev'"}) returning id`));
const fromA1 = lead("From A 1", APPT, A);
const fromA2 = lead("From A 2", APPT, A);
const fromB = lead("From B", APPT, B);
const onA = lead("Still on A", A);
const appt = Number(sql(`insert into public.appointments (lead_id, project_id, appt_date, appt_time) values (${fromA2}, ${APPT}, current_date + 3, '10:00 AM') returning id`));
const gone = (table, id) => sql(`select deleted_at is not null from public.${table} where id = ${id}`) === "t";

const browser = await launchBrowser();
try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1500, height: 1000 });
  const openDelete = async (id, name) => {
    await admin.go(`/projects?q=${encodeURIComponent(TAG)}`, 6000);
    await until(() => admin.ev(`!!document.querySelector('[aria-label="Actions for ${TAG} ${name}"]')`), { timeout: 15000 });
    await admin.mouseClick(`[aria-label="Actions for ${TAG} ${name}"]`);
    await until(() => admin.ev(`[...document.querySelectorAll('[role=menuitem]')].some((i) => i.textContent.trim() === 'Delete')`));
    await admin.ev(`[...document.querySelectorAll('[role=menuitem]')].find((i) => i.textContent.trim() === 'Delete').click()`);
    return until(() => admin.ev(`document.querySelector('[role=dialog]')?.innerText ?? null`), { timeout: 8000 });
  };
  const confirmDelete = () => admin.ev(`[...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Delete').click()`);

  section("A lead project that sent names on: the delete box offers to take them too");
  const box = (await openDelete(A, "List A DBDev")) ?? "";
  check("…saying how many, and where", box.includes(`Also remove the 2 names it sent to ${TAG} Appts`), box);
  check("…not ticked to begin with", await admin.ev(`document.querySelector('[data-delete-option="with_sent"] input')?.checked === false`));
  await admin.ev(`document.querySelector('[data-delete-option="with_sent"] input').click()`);
  await confirmDelete();
  check("ticked and deleted: the project and its own names", Boolean(await until(() => gone("projects", A) && gone("leads", onA), { timeout: 15000 })));
  check("…the names it sent to the appointment project, with their appointment", gone("leads", fromA1) && gone("leads", fromA2) && gone("appointments", appt));
  check("…not the name another lead project sent there", !gone("leads", fromB));
  check("…the appointment project itself stays", !gone("projects", APPT));
  check("…and it says so", /and the 2 names it sent on/.test((await admin.waitToast(/Deleted/, 8000)) ?? ""), await admin.toasts());

  section("Restored: they come back with it");
  const asAdmin = await signIn("admin@beacon.test");
  const { error } = await asAdmin.sb.rpc("restore_record", { p_table: "projects", p_id: A });
  if (error) throw error;
  check("the project, its names, the names it sent on and their appointment", ![["projects", A], ["leads", onA], ["leads", fromA1], ["leads", fromA2], ["appointments", appt]].some(([t, id]) => gone(t, id)));

  section("Not ticked: the names it sent on stay, as before");
  const boxB = (await openDelete(B, "List B DBDev")) ?? "";
  check("its box says 1 name", boxB.includes(`Also remove the 1 name it sent to ${TAG} Appts`), boxB);
  await confirmDelete();
  check("the project is deleted; its name on the appointment project stays", Boolean(await until(() => gone("projects", B), { timeout: 15000 })) && !gone("leads", fromB));
} finally {
  browser.close();
  sql(`delete from public.appointments where id = ${appt}`);
  sql(`delete from public.leads where company_name like ${lit(`${TAG}%`)}`);
  sql(`update public.projects set appt_project_id = null where id in (${A}, ${B})`);
  sql(`delete from public.projects where id in (${A}, ${B}, ${APPT})`);
  sql(`delete from public.companies where id = ${company}`);
}
finish("delete sent names");
