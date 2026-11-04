/**
 * The Insurance Companies list's figures (Sean, Nov 2026): carrier_footprint()
 * gives each carrier the states its leads are in (with the leads in each) and
 * how many leads (X-dates), from the carrier fields on our leads (however the
 * name is written) and a lead's own agency_id; a lead once, whichever of its
 * lines name the carrier; its agency (the broker) not a carrier; deleted
 * leads left out; and its clients, those with it among their Top Carriers on
 * Project Info. Picked states count those alone. A carrier's report:
 * carrier_clients() its clients with their X-dates, carrier_client_leads()
 * a client's. Administrators only.
 *
 * Removes everything it made.
 *
 *   node tests/integration/carrier-footprint.test.mjs
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `CF-TEST ${Date.now()}`;
const carrier = (name) => Number(sql(`insert into public.agencies (name) values (${lit(name)}) returning id`));
const A = carrier(`${TAG} Mutual Ins Co`);
const B = carrier(`${TAG} Casualty`);
const C = carrier(`${TAG} Nowhere`);
const client = (name) => Number(sql(`insert into public.companies (name) values (${lit(`${TAG} ${name}`)}) returning id`));
const project = (company) => Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} ${company}`)}, ${company}, (select id from public.project_types where code = 'APPT'), 1) returning id`));
const X = client("Rural"), Y = client("Capital");
const PX = project(X), PY = project(Y);
const lead = (p, state, details = {}, agency = "null") => {
  const id = Number(sql(`insert into public.leads (company_name, project_id, state, agency_id) values (${lit(`${TAG} ${state}`)}, ${p}, ${lit(state)}, ${agency}) returning id`));
  const cols = Object.keys(details);
  if (cols.length) sql(`insert into public.insurance_details (lead_id, ${cols.join(", ")}) values (${id}, ${cols.map((c) => lit(details[c])).join(", ")})`);
  return id;
};
// A: written three ways, on two lines of one lead (once), a dental plan, and a lead's own agency_id.
lead(PX, "AZ", { wc_carrier: `${TAG} Mutual Ins Co`, pkg_carrier: `${TAG.toLowerCase()}  mutual ins co` });
lead(PX, "NM", { auto_carrier: `${TAG}, Mutual Ins Co` });
lead(PY, "AZ", { dental_provider: `${TAG} Mutual Ins Co` });
lead(PY, "TX", {}, A);
// B: one lead. Not counted for A: a deleted lead, and A as a lead's agency (the broker, not its carrier).
lead(PY, "AZ", { wc_carrier: `${TAG} Casualty` });
const gone = lead(PX, "CA", { wc_carrier: `${TAG} Mutual Ins Co` });
sql(`delete from public.leads where id = ${gone}`);
lead(PX, "NV", { agency_name: `${TAG} Mutual Ins Co` });

// Top Carriers: Y lists A (written another way) on its project, X lists B. A third client lists A but has no leads with it.
const Z = client("Mesa");
const PZ = project(Z);
const top = (p, names) => sql(`insert into public.project_profiles (project_id, top_carriers) values (${p}, array[${names.map(lit).join(", ")}])`);
top(PY, [`${TAG.toLowerCase()} mutual ins co`, "Someone Else Ins"]);
top(PX, [`${TAG} Casualty`]);
top(PZ, [`${TAG} Mutual Ins Co`]);

const admin = await signIn("admin@beacon.test");
const manager = await signIn("sean@beacon.test");
const of = (rows, id) => {
  const r = (rows ?? []).find((x) => Number(x.agency_id) === id);
  return r && `${[...r.states].sort().join(",")} ${Number(r.leads)} ${Number(r.clients)}`;
};
const perState = (rows, id) => JSON.stringify(Object.fromEntries(Object.entries((rows ?? []).find((x) => Number(x.agency_id) === id)?.by_state ?? {}).sort()));

try {
  section("Every state");
  const { data, error } = await admin.sb.rpc("carrier_footprint", { p_states: null });
  check("a carrier's states and leads — its name however written, a lead once; its clients those listing it as a Top Carrier", !error && of(data, A) === "AZ,NM,TX 4 2", error?.message ?? of(data, A));
  check("…its leads in each state", perState(data, A) === JSON.stringify({ AZ: 2, NM: 1, TX: 1 }), perState(data, A));
  check("…another carrier's own", of(data, B) === "AZ 1 1", of(data, B));
  check("a carrier with no leads and no client listing it has no row", of(data, C) === undefined);

  section("The states picked");
  const az = await admin.sb.rpc("carrier_footprint", { p_states: ["AZ"] });
  check("Arizona's alone (the clients as listed, whatever the state)", !az.error && of(az.data, A) === "AZ 2 2" && of(az.data, B) === "AZ 1 1", az.error?.message ?? `${of(az.data, A)} / ${of(az.data, B)}`);
  const two = await admin.sb.rpc("carrier_footprint", { p_states: ["NM", "TX"] });
  check("two states: B none there, its client still counted", of(two.data, A) === "NM,TX 2 2" && of(two.data, B) === " 0 1", `${of(two.data, A)} / ${of(two.data, B)}`);

  section("A carrier's report");
  const clients = await admin.sb.rpc("carrier_clients", { p_agency: A, p_states: null });
  const listed = (clients.data ?? []).map((c) => `${c.client.replace(`${TAG} `, "")} ${Number(c.xdates)} ${[...c.states].sort().join(",")}`);
  check("its clients, A to Z, each with its X-dates naming it and their states — one with none listed too", !clients.error && JSON.stringify(listed) === JSON.stringify(["Capital 2 AZ,TX", "Mesa 0 "]),
    clients.error?.message ?? JSON.stringify(listed));
  const azOnly = await admin.sb.rpc("carrier_clients", { p_agency: A, p_states: ["TX"] });
  check("…in the states picked", (azOnly.data ?? []).map((c) => Number(c.xdates)).join() === "1,0", JSON.stringify(azOnly.data));
  const leadsY = await admin.sb.rpc("carrier_client_leads", { p_agency: A, p_company: Y, p_states: null });
  const rows = (leadsY.data ?? []).map((l) => `${l.state} ${(l.lines ?? []).filter((x) => x.mine).map((x) => x.key).join("+") || "agency"}`);
  check("a client's X-dates with it: each lead, the lines naming it (or its agency_id)", !leadsY.error && JSON.stringify(rows.sort()) === JSON.stringify(["AZ dental", "TX agency"]), leadsY.error?.message ?? JSON.stringify(rows));
  check("…with when it was created", (leadsY.data ?? []).every((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.created)), JSON.stringify(leadsY.data?.[0]));

  section("Administrators only");
  for (const [fn, args] of [["carrier_footprint", { p_states: null }], ["carrier_clients", { p_agency: A, p_states: null }], ["carrier_client_leads", { p_agency: A, p_company: Y, p_states: null }]]) {
    const theirs = await manager.sb.rpc(fn, args);
    check(`${fn}: a manager is refused`, theirs.error?.code === "42501", theirs.error?.message ?? "allowed");
  }
} finally {
  const like = lit(`${TAG}%`);
  sql(`delete from public.insurance_details where lead_id in (select id from public.leads where company_name like ${like})`);
  sql(`delete from public.leads where company_name like ${like}`);
  sql(`delete from public.project_profiles where project_id in (${PX}, ${PY}, ${PZ})`);
  sql(`delete from public.projects where id in (${PX}, ${PY}, ${PZ})`);
  sql(`delete from public.companies where id in (${X}, ${Y}, ${Z})`);
  sql(`delete from public.agencies where id in (${A}, ${B}, ${C})`);
}

finish("carrier footprint");
