/**
 * Search and the Lead Explorer, against the database as real signed-in
 * users: every word typed must match, in any order and any field; a phone
 * number is found however it is typed; Ctrl+K counts each group and says
 * whose a lead is; a renewal month counts any policy line's X-date; a
 * carrier matches by the name an import stored; and a client never finds
 * another client's leads.
 *
 * Runs on its own test client and removes everything it made.
 *
 *   npm run test:integration
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

// One word, so a search can include it to stay inside this test's own rows.
const TAG = `srch${Date.now()}`;
const PHONE_AREA = String(200 + (Date.now() % 700));
const PHONE = `(${PHONE_AREA}) 851-8511`;

const companyId = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Insurance Group`)}) returning id`));
const typeId = sql("select id from public.project_types where code='DBDV'");
const projectId = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} Plumbers Campaign`)}, ${companyId}, ${typeId}, 1) returning id`));
const carrierId = Number(sql(`insert into public.agencies (name) values (${lit(`${TAG} Mutual`)}) returning id`));

/** A lead on the test project; `ins` adds a policy-details row. */
function lead(name, more = {}, ins = null) {
  const cols = { company_name: lit(`${TAG} ${name}`), project_id: projectId, status_id: "(select id from public.lead_statuses where code='new')", ...more };
  const id = Number(sql(`insert into public.leads (${Object.keys(cols).join(", ")}) values (${Object.values(cols).join(", ")}) returning id`));
  if (ins) sql(`insert into public.insurance_details (lead_id, ${Object.keys(ins).join(", ")}) values (${id}, ${Object.values(ins).map(lit).join(", ")})`);
  return id;
}

const DRAIN = lead("AZ Pro Plumbing and Drain, LLC", { contact_name: lit("Dana Whitfield"), city: lit("Mesa"), state: lit("AZ"), phone: lit(PHONE) });
const PKG_ONLY = lead("Package Line Roofing", {}, { pkg_xdate: "2026-09-15" });
const WC_ONLY = lead("Comp Line Welding", {}, { wc_xdate: "2027-09-02", auto_xdate: "2027-12-01" });
const ULTIMATE = lead("Ultimate Date Electric", {}, { ultimate_xdate: "2026-03-10", pkg_xdate: "2026-09-01" });
const BY_NAME = lead("Carrier By Name Glass", {}, { agency_name: ` ${TAG} mutual ` });
const BY_ID = lead("Carrier By Id Glass", { agency_id: carrierId });
const otherCarrier = Number(sql(`insert into public.agencies (name) values (${lit(`${TAG} Casualty`)}) returning id`));
// Imported as TAG Mutual, since moved to another carrier on the lead form: its carrier is the other one now.
const MOVED = lead("Moved Carrier Glass", { agency_id: otherCarrier }, { agency_name: `${TAG} Mutual` });
const IMPORT_ONLY = lead("Import Only Glass", {}, { agency_name: `${TAG} Farm, Bureau` });
for (let i = 0; i < 5; i++) lead(`Filler ${i} Plumbing`);
const TWENTY_FOUR = lead("24-7 Emergency Plumbing");

const admin = await signIn("admin@beacon.test");
const client = await signIn("client@beacon.test");

const search = async (who, q, groups) => {
  const { data, error } = await who.sb.rpc("global_search", { q, per_group: 5, ...(groups ? { groups } : {}) });
  if (error) throw new Error(`global_search(${q}): ${error.message}`);
  return data ?? {};
};
const explore = async (criteria) => {
  const { data, error } = await admin.sb.rpc("lead_explore", { criteria: { q: TAG, ...criteria }, page: 1, per_page: 50 });
  if (error) throw new Error(`lead_explore: ${error.message}`);
  return data;
};
const ids = (items) => (items ?? []).map((x) => Number(x.id));

try {
  section("Every word counts");
  {
    const hit = await search(admin, `${TAG} Drain, LLC`);
    check("a comma in the name does not stop it matching", ids(hit.leads?.items).includes(DRAIN), JSON.stringify(hit.leads));
    check("words in any order", ids((await search(admin, `llc ${TAG} drain az`)).leads?.items).includes(DRAIN));
    check("words across fields (company and contact)", ids((await search(admin, `${TAG} plumbing whitfield`)).leads?.items).includes(DRAIN));
    check("a word that is not there means no match", (await search(admin, `${TAG} drain zebra`)).leads?.total === 0);
    check("nothing typed searches nothing", Object.keys(await search(admin, " , ")).length === 0);
    check("a number-like word in a name (“24-7”)", ids((await search(admin, `${TAG} 24-7 plumbing`)).leads?.items).includes(TWENTY_FOUR));
    check("a lead's state counts as a word", ids((await search(admin, `${TAG} drain az`)).leads?.items).includes(DRAIN));
  }

  section("Phone numbers however they are typed");
  for (const typed of [`${PHONE_AREA}8518511`, PHONE, `${PHONE_AREA} 851 8511`, `${PHONE_AREA}-851-8511`, `${PHONE_AREA}.851.8511`, "851-8511",
    `+1 ${PHONE}`, `1-${PHONE_AREA}-851-8511`, `1 ${PHONE_AREA} 851 8511`, `1${PHONE_AREA}8518511`]) {
    const hit = await search(admin, `${TAG} ${typed}`);
    check(`"${typed}" finds the lead`, ids(hit.leads?.items).includes(DRAIN), JSON.stringify(hit.leads?.total));
  }

  section("Ctrl+K: totals, the client and status, and only the groups asked for");
  {
    const hit = await search(admin, `${TAG} plumbing`);
    check("the total counts every match", hit.leads?.total === 7, JSON.stringify(hit.leads?.total));
    check("but lists at most five", hit.leads?.items?.length === 5);
    const drain = (await search(admin, `${TAG} drain`)).leads?.items?.find((x) => Number(x.id) === DRAIN);
    check("a lead says whose it is and where it stands", drain?.client === `${TAG} Insurance Group` && drain?.status === "New" && drain?.place === "Mesa, AZ",
      JSON.stringify(drain));
    check("a project is found by its client's name", ids((await search(admin, `${TAG} insurance`)).projects?.items).includes(projectId));
    const project = (await search(admin, `${TAG} plumbers`)).projects?.items?.[0];
    check("and says its client and status", project?.client === `${TAG} Insurance Group` && Boolean(project?.status), JSON.stringify(project));
    const onlyLeads = await search(admin, `${TAG} insurance`, ["leads"]);
    check("only the groups asked for come back", JSON.stringify(Object.keys(onlyLeads)) === JSON.stringify(["leads"]), JSON.stringify(Object.keys(onlyLeads)));
    const people = await search(admin, "Sean Fitzgerald", ["users"]);
    check("a person by first and last name", people.users?.total >= 1 && people.users.items.some((u) => u.email === "sean@beacon.test"), JSON.stringify(people.users));
  }

  section("A client never finds another client's leads");
  {
    const hit = await search(client, `${TAG} plumbing`);
    check("the client's search sees none of them", (hit.leads?.total ?? 0) === 0, JSON.stringify(hit.leads));
  }

  section("Lead Explorer: renewal month from any policy line");
  {
    const sept = await explore({ months: ["9"] });
    const found = ids(sept.rows);
    check("a package-line X-date counts", found.includes(PKG_ONLY));
    check("a workers' comp X-date counts, the soonest line", found.includes(WC_ONLY));
    check("the ultimate X-date wins over the other lines", !found.includes(ULTIMATE) && ids((await explore({ months: ["3"] })).rows).includes(ULTIMATE));
    const row = sept.rows.find((r) => Number(r.id) === WC_ONLY);
    check("each row carries its renewal date", row?.renewal_date === "2027-09-02", JSON.stringify(row?.renewal_date));
    const all = await explore({});
    const months = Object.fromEntries((all.by_month ?? []).map((m) => [m.label, Number(m.count)]));
    check("the month breakdown counts them the same way", months.Sep === 2 && months.Mar === 1, JSON.stringify(months));
    check("with a renewal date: three of the test leads", all.with_xdate === 3, String(all.with_xdate));
  }

  section("Lead Explorer: carriers by record or by the name an import stored");
  {
    const hit = ids((await explore({ carriers: [String(carrierId)] })).rows);
    check("a lead linked to the carrier", hit.includes(BY_ID));
    check("a lead whose policy names it (any case, stray spaces)", hit.includes(BY_NAME));
    check("and no others: not a lead moved to another carrier since", hit.length === 2 && !hit.includes(MOVED), JSON.stringify(hit));
    const byKey = ids((await explore({ carriers: [`${TAG} mutual`] })).rows);
    check("the same by the carrier's name", byKey.length === 2 && byKey.includes(BY_NAME) && byKey.includes(BY_ID), JSON.stringify(byKey));
    const { data: options } = await admin.sb.rpc("lead_explore_options");
    const importOnly = (options?.carriers ?? []).find((c) => c.label === `${TAG} Farm, Bureau`);
    check("a carrier known only from an import can be picked", importOnly?.value === `${TAG} farm bureau` && importOnly.count === 1, JSON.stringify(importOnly));
    check("and filters", ids((await explore({ carriers: [importOnly?.value ?? "-"] })).rows).join() === String(IMPORT_ONLY));
    const mutual = (options?.carriers ?? []).filter((c) => c.value === `${TAG} mutual`);
    check("a carrier is listed once however an import spelled it", mutual.length === 1 && mutual[0].label === `${TAG} Mutual` && mutual[0].count === 2, JSON.stringify(mutual));
    const row = (await explore({ carriers: [String(carrierId)] })).rows.find((r) => Number(r.id) === BY_NAME);
    check("the row names the carrier", row?.carrier_name?.trim().toLowerCase() === `${TAG} mutual`, JSON.stringify(row?.carrier_name));
  }

  section("Lead Explorer: paging limits");
  {
    const { data, error } = await admin.sb.rpc("lead_explore", { criteria: { q: TAG }, page: 2147483647, per_page: 100000 });
    check("a huge page number or size is no error", !error && Array.isArray(data?.rows), error?.message);
  }

  section("Lists: consecutive word filters all apply");
  {
    // What the users list sends for "Sean Fitzgerald": one or-filter per word.
    const word = (w) => ["first_name", "last_name", "email"].map((c) => `${c}.ilike.%${w}%`).join(",");
    const { data, error } = await admin.sb.from("users").select("email").or(word("sean")).or(word("fitzgerald"));
    check("both words must match", !error && data.length >= 1 && data.every((u) => u.email === "sean@beacon.test"), error?.message ?? JSON.stringify(data));
    const leads = await admin.sb.from("leads").select("id").or(`search_text.ilike.%${TAG}%`).or("search_text.ilike.%drain%").or("search_text.ilike.%llc%");
    check("a lead by its search text, word by word", !leads.error && ids(leads.data).join() === String(DRAIN), leads.error?.message ?? JSON.stringify(leads.data));
  }
} finally {
  sql(`delete from public.notifications where title like ${lit(`%${TAG}%`)} or body like ${lit(`%${TAG}%`)}`);
  sql(`delete from public.leads where company_name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.projects where name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.agencies where name like ${lit(`${TAG}%`)}`);
  sql(`delete from public.companies where name like ${lit(`${TAG}%`)}`);
}

finish("search");
