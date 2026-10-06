/**
 * Emails to a name's contact, against the database as real signed-in users:
 * who may send one (can_work_lead(): the people who may record a result on
 * the name), and that nobody can add, change or remove one from the app.
 * Only the server, with its own role, keeps them; staff read them.
 *
 * Runs on its own test client and removes everything it made.
 *
 *   npm run test:integration
 */
import { createClient } from "@supabase/supabase-js";
import { check, finish, section } from "../support/assert.mjs";
import { adminClient, signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";
import { ANON_KEY, SUPABASE_URL } from "../support/env.mjs";

const TAG = `EM-TEST ${Date.now()}`;
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const SEAN = userId("sean@beacon.test");
const MIKE = userId("mike@beacon.test");
const RACHEL = userId("rachel@beacon.test");

const companyId = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} DBDev`)}, ${companyId}, (select id from public.project_types where code='DBDV'), 1) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${project}, ${MIKE})`);
const newName = (rep = null) => Number(sql(`insert into public.leads (company_name, email, project_id, assigned_user_id)
  values (${lit(`${TAG} Co`)}, 'owner@acme.test', ${project}, ${rep ?? "null"}) returning id`));

const seans = newName(SEAN);           // held by Sean
const onProject = newName();           // nobody holds it; Mike is on its project
const followUp = newName();            // Rachel set its open appointment
sql(`insert into public.appointments (lead_id, user_id, appt_date) values (${followUp}, ${RACHEL}, current_date + 7)`);

const as = {};
for (const who of ["admin", "sean", "mike", "rachel", "agent", "client"]) as[who] = (await signIn(`${who}@beacon.test`)).sb;
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
const may = async (sb, lead) => {
  const { data, error } = await sb.rpc("can_work_lead", { p_lead_id: lead });
  return error ? `error: ${error.message}` : data;
};

try {
  section("Who may email a name");
  {
    check("an administrator may email any name", (await may(as.admin, seans)) === true && (await may(as.admin, onProject)) === true);
    check("the rep who holds it may", (await may(as.sean, seans)) === true);
    check("…but not a name held by nobody on a project he is not on", (await may(as.sean, onProject)) === false);
    check("someone on its project may", (await may(as.mike, onProject)) === true && (await may(as.mike, seans)) === true);
    check("whoever set its open appointment may (they confirm it)", (await may(as.rachel, followUp)) === true);
    check("…and not once that appointment is marked invalid", (() => {
      sql(`update public.appointments set invalid_at = now() where lead_id = ${followUp}`);
      return true;
    })() && (await may(as.rachel, followUp)) === false);
    check("an agent with no tie to the name may not", (await may(as.agent, seans)) === false);
    check("a client may not", (await may(as.client, seans)) === false);
    check("a name that is gone: no", (await may(as.admin, 999999999)) === false);
    const signedOut = await may(anon, seans);
    check("signed out, the question cannot even be asked", String(signedOut).startsWith("error"), String(signedOut));
  }

  section("Nobody writes the history from the app");
  {
    const row = { lead_id: seans, to_address: "owner@acme.test", subject: "Faked", body: "Not really sent", status: "sent" };
    const { error: inserted } = await as.sean.from("lead_emails").insert({ ...row, user_id: SEAN });
    check("the rep cannot add a 'sent' email of his own", Boolean(inserted), inserted?.message ?? "inserted");
    const { error: byAdmin } = await as.admin.from("lead_emails").insert({ ...row, user_id: SEAN });
    check("…nor can an administrator, from the app", Boolean(byAdmin), byAdmin?.message ?? "inserted");

    const server = adminClient();
    const { data: kept, error: serverError } = await server.from("lead_emails")
      .insert({ ...row, subject: `${TAG} kept`, user_id: SEAN }).select("id").single();
    check("the server keeps one with its own role", !serverError && Boolean(kept?.id), serverError?.message);
    const { count, error: countError } = await server.from("lead_emails").select("id", { count: "exact", head: true }).eq("user_id", SEAN);
    check("…and can count a person's, for the hourly limit", !countError && count >= 1, countError?.message);

    const { data: changed } = await as.sean.from("lead_emails").update({ subject: "Changed" }).eq("id", kept.id).select("id");
    const { data: removed } = await as.admin.from("lead_emails").delete().eq("id", kept.id).select("id");
    check("nobody changes or removes one from the app", !changed?.length && !removed?.length
      && sql(`select subject from public.lead_emails where id = ${kept.id}`) === `${TAG} kept`);

    const seen = async (sb) => (await sb.from("lead_emails").select("id").eq("id", kept.id)).data?.length ?? 0;
    check("staff read it, as they read the calls", (await seen(as.sean)) === 1 && (await seen(as.agent)) === 1 && (await seen(as.admin)) === 1);
    check("a client does not", (await seen(as.client)) === 0);
    check("nor does anyone signed out", (await seen(anon)) === 0);
  }
} finally {
  sql(`delete from public.appointments where lead_id = ${followUp}`);
  sql(`delete from public.leads where project_id = ${project}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${companyId}`);
}

finish("lead email");
