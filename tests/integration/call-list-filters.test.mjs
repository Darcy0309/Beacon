/**
 * Filtering a call list, against the database as a real account manager:
 * names renewing in a window of the year (any year, wrapping Nov – Jan),
 * by city, ZIP, county, industry, carrier (on any line), year developed,
 * developer and result, each included or excluded; the filter is the
 * manager's own and steers the next name; the options come from the list.
 *
 * Removes everything it made.
 *
 *   node tests/integration/call-list-filters.test.mjs
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";

const TAG = `CLF-TEST ${Date.now()}`;
const sean = await signIn("sean@beacon.test");
const mike = await signIn("mike@beacon.test");
const SEAN = sean.me.id;
const MIKE = mike.me.id;
const company = Number(sql(`insert into public.companies (name) values (${lit(`${TAG} Co`)}) returning id`));
const project = Number(sql(`insert into public.projects (name, company_id, project_type_id, status_id)
  values (${lit(`${TAG} Appts`)}, ${company}, (select id from public.project_types where code = 'APPT'), 1) returning id`));
sql(`insert into public.project_assignments (project_id, ae_user_id) values (${project}, ${SEAN})`);
const noContact = sql("select id from public.call_results where project_type = 'APPT' and name = 'Lead-No Contact'");
const leftMessage = sql("select id from public.call_results where project_type = 'APPT' and name = 'Lead-Left Message'");

// name, city, zip, county, sic, renewal, carrier (on a line), developed (year), developer, result
const NAMES = [
  ["Nov Phoenix", "Phoenix", "85001", "Maricopa", "1711", "2025-11-15", "The Hartford", 2025, MIKE, noContact],
  ["Dec Mesa", "Mesa", "85201-1234", "Maricopa", "1731", "2026-12-01", "Travelers", 2026, SEAN, noContact],
  ["Jan Tucson", "Tucson", "85701", "Pima", "1711", "2027-01-31", "The Hartford", 2026, MIKE, leftMessage],
  ["Feb Phoenix", "phoenix ", "85002", "Maricopa", "1761", "2026-02-01", "Acuity", 2025, SEAN, noContact],
  ["No renewal", "Mesa", "85203", "Maricopa", "1711", null, null, 2026, null, noContact],
];
const ids = {};
for (const [name, city, zip, county, sic, renewal, carrier, year, dev, result] of NAMES) {
  const id = Number(sql(`insert into public.leads (project_id, company_name, city, zip, county, sic_code, assigned_user_id, dbdv_user_id, result_id, promoted_at)
    values (${project}, ${lit(`${TAG} ${name}`)}, ${lit(city)}, ${lit(zip)}, ${lit(county)}, ${lit(sic)}, ${SEAN}, ${dev ?? "null"}, ${result}, ${lit(`${year}-06-15 12:00:00+00`)}) returning id`));
  ids[name] = id;
  if (renewal || carrier) sql(`insert into public.insurance_details (lead_id, ultimate_xdate, wc_carrier) values (${id}, ${renewal ? lit(renewal) : "null"}, ${carrier ? lit(carrier) : "null"})`);
}
const label = (id) => Object.entries(ids).find(([, v]) => v === id)?.[0];
// Feb Phoenix's workers comp renews in December (its Ultimate X-Date is Feb 1); two names came from one list.
sql(`update public.insurance_details set wc_xdate = '2026-12-10' where lead_id = ${ids["Feb Phoenix"]}`);
sql(`update public.leads set list_source = 'IPA-Maricopa-Cold_2026' where id in (${ids["Nov Phoenix"]}, ${ids["No renewal"]})`);

const listWith = async (criteria) => {
  const up = await sean.sb.from("call_list_filters").upsert({ user_id: SEAN, project_id: project, criteria }, { onConflict: "user_id,project_id" });
  if (up.error) throw new Error(up.error.message);
  const { data, error } = await sean.sb.rpc("call_list", { p_project_id: project, p_limit: 50 });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => label(r.id)).sort().join(" | ");
};
const names = (...n) => [...n].sort().join(" | ");

try {
  section("A window of the year, any year");
  check("Nov 1 – Jan 31 runs over the new year, on any policy line", (await listWith({ renewal: { from: "11-01", to: "01-31" } })) === names("Nov Phoenix", "Dec Mesa", "Jan Tucson", "Feb Phoenix"),
    await listWith({ renewal: { from: "11-01", to: "01-31" } }));
  check("…one month at a time: December, by the Ultimate X-Date or a line (Feb Phoenix's workers comp)",
    (await listWith({ renewal: { from: "12-01", to: "12-31" } })) === names("Dec Mesa", "Feb Phoenix"), await listWith({ renewal: { from: "12-01", to: "12-31" } }));
  {
    await listWith({ renewal: { from: "12-01", to: "12-31" } });
    const { data } = await sean.sb.rpc("call_list", { p_project_id: project, p_limit: 50 });
    const m = data?.find((r) => label(r.id) === "Feb Phoenix")?.renewal_match;
    check("…and each says which X-date put it in the window", m?.line === "wc" && m?.date === "2026-12-10", JSON.stringify(m));
  }
  check("…or on one line only: workers comp in December", (await listWith({ renewal: { from: "12-01", to: "12-31", line: "wc" } })) === names("Feb Phoenix"));
  check("…or the Ultimate X-Date only", (await listWith({ renewal: { from: "12-01", to: "12-31", line: "ultimate" } })) === names("Dec Mesa"));
  check("…excluded: no X-date in the window, a name with none at all too",
    (await listWith({ renewal: { from: "11-01", to: "01-31", exclude: true } })) === names("No renewal"));

  section("Place, industry, carrier, who and when");
  check("city, whatever its spacing or case", (await listWith({ city: { values: ["phoenix"] } })) === names("Nov Phoenix", "Feb Phoenix"));
  check("…excluded", (await listWith({ city: { values: ["phoenix", "mesa"], exclude: true } })) === names("Jan Tucson"));
  check("ZIP code, its first five digits", (await listWith({ zip: { values: ["85201"] } })) === names("Dec Mesa"));
  check("county", (await listWith({ county: { values: ["pima"] } })) === names("Jan Tucson"));
  check("industry (SIC)", (await listWith({ sic: { values: ["1711"] } })) === names("Nov Phoenix", "Jan Tucson", "No renewal"));
  check("carrier, on any policy line", (await listWith({ carrier: { values: ["the hartford"] } })) === names("Nov Phoenix", "Jan Tucson"));
  check("…excluded: a name with no carrier stays", (await listWith({ carrier: { values: ["the hartford"], exclude: true } })) === names("Dec Mesa", "Feb Phoenix", "No renewal"));
  check("year developed", (await listWith({ year: { values: ["2025"] } })) === names("Nov Phoenix", "Feb Phoenix"));
  check("developed by", (await listWith({ developer: { values: [String(MIKE)] } })) === names("Nov Phoenix", "Jan Tucson"));
  check("call result", (await listWith({ result: { values: [String(leftMessage)] } })) === names("Jan Tucson"));
  check("the list a name came from (a lead manager's cold lists)", (await listWith({ source: { values: ["ipa-maricopa-cold_2026"] } })) === names("Nov Phoenix", "No renewal"));
  check("all together: Nov – Jan, in Maricopa, not The Hartford",
    (await listWith({ renewal: { from: "11-01", to: "01-31" }, county: { values: ["maricopa"] }, carrier: { values: ["the hartford"], exclude: true } })) === names("Dec Mesa", "Feb Phoenix"));

  section("The list follows it everywhere");
  await listWith({ renewal: { from: "12-01", to: "12-31" } });
  const next = await sean.sb.rpc("call_list", { p_project_id: project, p_limit: 2 });
  check("the next name (Start calling, Skip, after a result) comes from the filtered list",
    Number(next.data?.[0]?.total) === 2 && next.data.every((r) => ["Dec Mesa", "Feb Phoenix"].includes(label(r.id))), JSON.stringify(next.data?.map((r) => label(r.id))));
  const all = await sean.sb.rpc("call_list", { p_project_id: project, p_limit: 50, p_filtered: false });
  check("…and without it, every name left", Number(all.data?.[0]?.total) === NAMES.length);
  // As if it were set yesterday (the stamp is the database's own, so set it past that).
  sql(`alter table public.call_list_filters disable trigger call_list_filters_touch`);
  sql(`update public.call_list_filters set updated_at = now() - interval '1 day' where user_id = ${SEAN} and project_id = ${project}`);
  sql(`alter table public.call_list_filters enable trigger call_list_filters_touch`);
  const nextDay = await sean.sb.rpc("call_list", { p_project_id: project, p_limit: 50 });
  check("a filter set yesterday is set aside: each morning the list starts in full", Number(nextDay.data?.[0]?.total) === NAMES.length, nextDay.data?.[0]?.total);
  await listWith({ renewal: { from: "12-01", to: "12-31" } });
  check("…applied again, it holds for the rest of the day", (await listWith({ renewal: { from: "12-01", to: "12-31" } })) === names("Dec Mesa", "Feb Phoenix"));
  const theirs = await mike.sb.from("call_list_filters").select("criteria").eq("user_id", SEAN);
  check("a manager's filter is their own", !theirs.error && theirs.data.length === 0, JSON.stringify(theirs.data));
  const forge = await mike.sb.from("call_list_filters").insert({ user_id: SEAN, project_id: project, criteria: {} });
  check("…nobody else can set it", Boolean(forge.error));

  section("What the filter offers");
  const { data: o, error } = await sean.sb.rpc("call_list_options", { p_project_id: project });
  const count = (k, v) => o?.[k]?.find((x) => x.value === v)?.count;
  check("the values on the list, with how many names have each, as written", !error && count("city", "phoenix") === 2
    && o.city.find((x) => x.value === "phoenix")?.label === "Phoenix" && count("zip", "85201") === 1
    && count("carrier", "the hartford") === 2 && count("year", "2026") === 3 && count("developer", String(MIKE)) === 2
    && o.sic.some((x) => x.value === "1711" && /Plumbing/.test(x.label))
    && o.source?.some((x) => x.label === "IPA-Maricopa-Cold_2026" && x.count === 2), error?.message ?? JSON.stringify(o));
} finally {
  sql(`delete from public.call_list_filters where project_id = ${project}`);
  sql(`delete from public.insurance_details where lead_id in (select id from public.leads where project_id = ${project})`);
  sql(`delete from public.leads where project_id = ${project}`);
  sql(`delete from public.project_assignments where project_id = ${project}`);
  sql(`delete from public.project_assignment_log where project_id = ${project}`);
  sql(`delete from public.projects where id = ${project}`);
  sql(`delete from public.companies where id = ${company}`);
}

finish("call list filters");
