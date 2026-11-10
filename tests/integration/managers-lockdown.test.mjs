#!/usr/bin/env node
/**
 * What account managers may no longer do (client, Nov 2026). Lead Explorer: only
 * the projects they are assigned to, a shared one too; its counts and its pickers
 * the same; no more than a page at a time (an administrator still sees every
 * project). List Builder: administrators and clients only; a manager reads,
 * makes and changes no requests, and makes no prospect links.
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `EXM-TEST ${Date.now()}`;
const admin = await signIn("admin@beacon.test");
const sean = await signIn("sean@beacon.test"); // a manager
const mike = await signIn("mike@beacon.test"); // a manager
const client = await signIn("client@beacon.test");

const type = (code) => Number(sql(`select id from public.project_types where code = '${code}'`));
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance`)}) returning id`));
const project = (name) => Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id) values (${lit(`${TAG} ${name}`)}, ${company}, ${type("APPT")}, 1) returning id`));
const MINE = project("Sean's");
const SHARED = project("Shared");
const NOT_MINE = project("Mike's");
const assign = (p, user) => sql(`insert into public.project_assignments (project_id, ae_user_id) values (${p}, ${user})`);
assign(MINE, sean.me.id);
assign(SHARED, sean.me.id);
assign(SHARED, mike.me.id);
assign(NOT_MINE, mike.me.id);
for (const [p, n] of [[MINE, 3], [SHARED, 2], [NOT_MINE, 4]]) {
  for (let i = 0; i < n; i++) sql(`insert into public.leads (company_name, project_id, stage) values (${lit(`${TAG} ${p}-${i}`)}, ${p}, 'appt')`);
}
const ours = { projects: [MINE, SHARED, NOT_MINE] };
const explore = async (who, criteria = ours, perPage = 50) => (await who.sb.rpc("lead_explore", { criteria, page: 1, per_page: perPage })).data;
const projectIds = (r) => [...new Set((r?.rows ?? []).map((l) => l.project_id))].sort((a, b) => a - b);

try {
  section("A manager: their own projects, a shared one too");
  const s = await explore(sean);
  check("Sean sees his project and the shared one, not Mike's", s?.total === 5 && JSON.stringify(projectIds(s)) === JSON.stringify([MINE, SHARED].sort((a, b) => a - b)),
    JSON.stringify({ total: s?.total, projects: projectIds(s) }));
  const m = await explore(mike);
  check("Mike sees his and the shared one, not Sean's", m?.total === 6 && !projectIds(m).includes(MINE), JSON.stringify({ total: m?.total, projects: projectIds(m) }));
  check("asking for a project not theirs finds nothing", (await explore(sean, { projects: [NOT_MINE] }))?.total === 0);
  check("…and without criteria, nothing of Mike's alone", !(await explore(sean, {}, 100))?.rows.some((l) => l.project_id === NOT_MINE));

  section("Its counts and pickers");
  const opts = (await sean.sb.rpc("lead_explore_options")).data;
  const pickable = (opts?.projects ?? []).map((p) => p.value);
  check("the Project picker lists only theirs", pickable.includes(MINE) && pickable.includes(SHARED) && !pickable.includes(NOT_MINE), JSON.stringify(pickable.filter((v) => [MINE, SHARED, NOT_MINE].includes(v))));
  const assigned = sql(`select string_agg(distinct p.company_id::text, ',') from public.project_assignments pa join public.projects p on p.id = pa.project_id where pa.ae_user_id = ${sean.me.id}`).split(",").map(Number);
  check("…the Client picker only clients of theirs", (opts?.clients ?? []).every((c) => assigned.includes(c.value)), JSON.stringify((opts?.clients ?? []).length));
  check("the client breakdown counts only theirs", s?.by_client?.find((c) => c.id === company)?.count === 5, JSON.stringify(s?.by_client?.find((c) => c.id === company)));

  section("No more than a page at a time");
  const big = await explore(sean, {}, 10000);
  check("a manager asking for 10,000 rows gets at most 100", (big?.rows?.length ?? 0) <= 100, String(big?.rows?.length));

  section("An administrator: every project");
  const a = await explore(admin);
  check("all three projects", a?.total === 9 && projectIds(a).length === 3, JSON.stringify({ total: a?.total, projects: projectIds(a) }));
  check("…and the pickers all of them", ((await admin.sb.rpc("lead_explore_options")).data?.projects ?? []).filter((p) => [MINE, SHARED, NOT_MINE].includes(p.value)).length === 3);
  section("List Builder: administrators and clients only");
  const REQ = Number(sql(`insert into public.list_requests (company_id, source, title, criteria) values (${company}, 'staff', ${lit(`${TAG} request`)}, '{}'::jsonb) returning id`));
  try {
    check("a manager reads no list requests", ((await sean.sb.from("list_requests").select("id").eq("id", REQ)).data ?? []).length === 0);
    const made = await sean.sb.from("list_requests").insert({ company_id: company, source: "staff", title: `${TAG} by Sean`, criteria: {} }).select("id");
    check("…makes none", Boolean(made.error) && !made.data?.length, made.error?.message);
    const changed = await sean.sb.from("list_requests").update({ title: `${TAG} changed` }).eq("id", REQ).select("id");
    check("…changes none", !(changed.data ?? []).length && sql(`select title from public.list_requests where id = ${REQ}`) === `${TAG} request`);
    const link = await sean.sb.from("list_request_links").insert({ token: `${Date.now()}abcdef0123456789abcd`, sales_rep_id: sean.me.id }).select("id");
    check("…and makes no prospect links", Boolean(link.error), link.error?.message);
    check("an administrator still reads it", ((await admin.sb.from("list_requests").select("id").eq("id", REQ)).data ?? []).length === 1);
    const clientCompany = sql(`select coalesce(company_id::text, '') from public.users where id = ${client.me.id}`);
    const own = Number(sql(`insert into public.list_requests (company_id, source, title, criteria) values (${clientCompany || "null"}, 'client', ${lit(`${TAG} theirs`)}, '{}'::jsonb) returning id`));
    check("a client still reads its own", !clientCompany || ((await client.sb.from("list_requests").select("id").eq("id", own)).data ?? []).length === 1);
    sql(`delete from public.list_requests where id = ${own}`);
  } finally {
    sql(`delete from public.notifications where link = '/list-builder/${REQ}'`);
    sql(`delete from public.list_requests where id = ${REQ} or title like ${lit(`${TAG}%`)}`);
  }
} finally {
  sql(`delete from public.leads where project_id in (${MINE}, ${SHARED}, ${NOT_MINE})`);
  sql(`delete from public.project_assignments where project_id in (${MINE}, ${SHARED}, ${NOT_MINE})`);
  sql(`delete from public.projects where id in (${MINE}, ${SHARED}, ${NOT_MINE})`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("managers lock-down");
