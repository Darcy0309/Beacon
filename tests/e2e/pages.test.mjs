/**
 * Every page renders real data for the people who should see it.
 *
 * Signs in exactly the way the app does (the @supabase/ssr cookie flow),
 * requests every page over HTTP with that session, and looks for records read
 * out of the database first, so reseeding with different demo data does not
 * break the run. Signed-out visitors must be sent to the sign-in page, and a
 * client must never see another client's data.
 *
 *   npm run test:e2e      (local stack + the app on TEST_APP_URL, default :3000)
 */
import { APP_URL } from "../support/env.mjs";
import { check, finish, section } from "../support/assert.mjs";
import { signIn as apiSignIn, sessionCookies, cookieHeader } from "../support/auth.mjs";
import { clientSlug as slug } from "../../src/lib/format.js";

/** A session cookie header for the app, and an API client as the same user. */
async function signIn(email) {
  const [jar, { sb, error }] = await Promise.all([sessionCookies(email), apiSignIn(email)]);
  if (error) throw error;
  return { supabase: sb, cookie: cookieHeader(jar) };
}

const get = (path, cookie) => fetch(`${APP_URL}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });

const admin = await signIn("admin@beacon.test");
const client = await signIn("client@beacon.test");

// Real records to look for, read the way each page orders its own rows so the
// value is guaranteed to land on the first page.
const rows = async (table, select, order = {}) => {
  let q = admin.supabase.from(table).select(select);
  for (const [col, opts] of Object.entries(order)) q = q.order(col, opts);
  const { data, error } = await q.limit(5);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
};

const [leads, companies, projects, imports, agencies, managers] = await Promise.all([
  rows("leads", "id, company_name", { lead_date: { ascending: false, nullsFirst: false }, id: { ascending: false } }),
  rows("companies", "id, name", { name: {} }),
  rows("projects", "id, name", { id: {} }),
  rows("import_batches", "file_name", { created_at: { ascending: false } }),
  rows("agencies", "name", { name: {} }),
  admin.supabase.from("users").select("first_name").eq("role", "manager").limit(1).then((r) => r.data ?? []),
]);

if (!leads.length || !companies.length || !projects.length) {
  console.error("\nThe database has no leads, companies or projects — seed it first.\n");
  process.exit(1);
}

const lead = leads[0];
const company = companies[0];
const project = projects[0];

// Pages every signed-in staff user should get, with a string proving the page
// rendered real database content rather than an empty shell.
const PAGES = [
  ["/", "Dashboard", ["Total Leads", "Recent Leads", "Command Center"]],
  ["/leads", "Leads", ["All leads", lead.company_name]],
  ["/appointments", "Appointments", ["Next 7 Days"]],
  ["/calendar", "Calendar", ["Mon", "Sun"]],
  ["/clients", "Clients", companies.slice(0, 2).map((c) => c.name)],
  ["/projects", "Projects", [project.name]],
  ["/account-managers", "Account Managers", managers.length ? [managers[0].first_name] : ["Team"]],
  ["/insurance-companies", "Insurance Companies", agencies.length ? [agencies[0].name] : ["Carriers"]],
  ["/feedback", "Feedback", ["Average rating"]],
  ["/qa", "QA", ["Recent scored calls"]],
  ["/bulletin", "Bulletin", ["Bulletin"]],
  ["/documents", "Documents", ["All documents"]],
  ["/imports", "Imports", imports.length ? ["Recent imports", imports[0].file_name] : ["Recent imports"]],
  ["/reports", "Reports", ["Leads Delivered", "Appointments Set", "Leads by Status"]],
  ["/reports/x-dates", "X-Dates by Month", ["Renewals by Month", "All months", project.name]],
  ["/reports/production", "Production & Pay", ["By Rep", "Pay Rates by Project", project.name]],
  ["/reports/pay", "Pay & Hours", ["Pay for the Period", "Hours Paid", "Commission", "Sean Fitzgerald"]],
  ["/alerts", "Alerts", ["Alert rules"]],
  ["/users", "Users", ["Users", "beacon.test"]],
  ["/settings", "Settings", ["Branding", "Email (SMTP)", "Sign-in Security", "Pay Rates", "Time Worked"]],
];

section("Signed out: protected routes must redirect");
for (const [path] of PAGES) {
  const res = await get(path);
  check(`${path} → login`, res.status === 307 || res.status === 302, `got ${res.status}`);
}

section("Administrator (admin@beacon.test)");
for (const [path, label, needles] of PAGES) {
  const res = await get(path, admin.cookie);
  if (res.status !== 200) {
    check(`${label} (${path})`, false, `HTTP ${res.status}`);
    continue;
  }
  const html = (await res.text()).toLowerCase();
  const missing = needles.filter((n) => !html.includes(String(n).toLowerCase()));
  check(`${label} (${path})`, missing.length === 0, missing.length ? `missing ${missing.join(", ")}` : "");
}

// Detail pages resolve real ids.
section("Detail pages");
for (const [path, label, needle] of [
  [`/leads/${lead.id}`, "Lead sheet", "Lead Sheet"],
  [`/clients/${slug(company.name)}`, "Client profile", "Projects"],
  [`/projects/${project.id}`, "Project detail", "Leads on this Project"],
]) {
  const res = await get(path, admin.cookie);
  const html = res.status === 200 ? (await res.text()).toLowerCase() : "";
  check(`${label} (${path})`, res.status === 200 && html.includes(needle.toLowerCase()), `HTTP ${res.status}`);
}

section("Client portal user (client@beacon.test)");
for (const [path, label] of [
  ["/", "Dashboard reachable"],
  ["/appointments", "Appointments reachable"],
]) {
  const res = await get(path, client.cookie);
  check(`${label} (${path})`, res.status === 200, `HTTP ${res.status}`);
}
{
  // RLS must hide other clients' data even though the route is reachable:
  // find a company this client cannot read, then prove it never reaches the page.
  const { data: visible } = await client.supabase.from("companies").select("name");
  const mine = new Set((visible ?? []).map((c) => c.name));
  const hidden = companies.find((c) => !mine.has(c.name));
  if (!hidden) {
    check("Dashboard hides other clients' leads", false, "this client can read every company — nothing to hide");
  } else {
    const res = await get("/", client.cookie);
    const html = res.status === 200 ? await res.text() : "";
    check(`Dashboard hides other clients' data (${hidden.name})`, !html.includes(hidden.name));
  }
}

finish("page");
