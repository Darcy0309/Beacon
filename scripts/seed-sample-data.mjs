#!/usr/bin/env node
/**
 * Fills empty projects with sample leads, and puts a little data behind the
 * QA, feedback, bulletin and document screens, so every page of the demo has
 * something to show before the client's remaining lists arrive.
 *
 *   node scripts/seed-sample-data.mjs --dry-run
 *   node scripts/seed-sample-data.mjs --confirm
 *
 * Everything written here is invented and marked as such: the list source
 * reads SAMPLE, and every phone number uses the 555 exchange reserved for
 * fiction. Projects that already hold leads are left alone, so this can never
 * touch a real imported list.
 */
import { createClient } from "@supabase/supabase-js";
import { fetch as undiciFetch, Agent } from "undici";
import { readFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const DRY_RUN = !args.includes("--confirm");
const SAMPLE_SOURCE = "SAMPLE — replace with the client's list";

// --- transport -------------------------------------------------------------
const agent = new Agent({
  connections: 4,
  keepAliveTimeout: 60_000,
  keepAliveMaxTimeout: 60_000,
  connectTimeout: 10_000,
  headersTimeout: 60_000,
  bodyTimeout: 60_000,
});
const retryingFetch = async (url, init = {}) => {
  const method = String(init.method ?? "GET").toUpperCase();
  const budgets = method === "GET" || method === "HEAD" ? [30_000, 20_000, 20_000] : [60_000];

  let lastError;
  for (const budget of budgets) {
    try {
      return await undiciFetch(url, { ...init, signal: AbortSignal.timeout(budget), dispatcher: agent });
    } catch (err) {
      lastError = err;
      if (budgets.length > 1) process.stdout.write("  (retrying a slow read)\n");
    }
  }
  throw lastError;
};

const env = {};
if (existsSync(new URL("../.env.local", import.meta.url))) {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
}
const URL_ = process.env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("Needs SUPABASE_URL and a service key (SUPABASE_SERVICE_ROLE_KEY in .env.local).");
  process.exit(1);
}
const sb = createClient(URL_, KEY, { auth: { persistSession: false }, global: { fetch: retryingFetch } });

// --- the shapes a contractor list actually takes ---------------------------
const TRADES = [
  { word: "Plumbing", sic: "1711", nature: "Plumbing contractor" },
  { word: "Mechanical", sic: "1711", nature: "HVAC contractor" },
  { word: "Air Conditioning", sic: "1711", nature: "HVAC contractor" },
  { word: "Electric", sic: "1731", nature: "Electrical contractor" },
  { word: "Electrical Services", sic: "1731", nature: "Electrical contractor" },
  { word: "Roofing", sic: "1761", nature: "Roofing contractor" },
  { word: "Sheet Metal", sic: "1761", nature: "Sheet metal work" },
  { word: "Painting", sic: "1721", nature: "Painting contractor" },
  { word: "Landscaping", sic: "0782", nature: "Landscape services" },
  { word: "Fire Protection", sic: "1711", nature: "Fire sprinkler systems" },
];
const PREFIXES = [
  "Ironwood", "Redstone", "Summit", "Blue Ridge", "Copper Creek", "Lakeside", "Granite",
  "Northgate", "Silver Fork", "Cedar Park", "Harbour", "Foxglove", "Kestrel", "Milltown",
  "Pinnacle", "Riverbend", "Stonegate", "Westfield", "Brightwater", "Clearview", "Oakhollow",
  "Sagebrook", "Thornhill", "Vanguard", "Windmere", "Alder", "Basalt", "Cobalt", "Driftwood",
];
const SUFFIXES = ["LLC", "Inc", "Co", "& Sons", "Group", "Services", "Contractors", ""];
const FIRST = ["James","Maria","Robert","Linda","Michael","Patricia","David","Jennifer","Carlos","Susan","Daniel","Karen","Luis","Nancy","Kevin","Sandra","Brian","Donna","Eric","Carol","Tomas","Angela","Derek","Rhonda","Marcus","Elena","Grant","Paula"];
const LAST = ["Alvarez","Bennett","Carver","Delgado","Ellison","Foster","Garrett","Hollis","Iverson","Jensen","Kowalski","Lambert","Mercado","Nolan","Okafor","Pruitt","Quintero","Ramsey","Sutton","Tran","Underwood","Vargas","Whitaker","Yates","Zimmer"];
const TITLES = ["Owner", "Office Manager", "President", "Operations Manager", "Controller", "Managing Member", "General Manager"];
const CARRIERS = ["Acuity","Hartford","Travelers","Secura","Pekin Ins Co","Employers","West Bend","Copperpoint","Amtrust","Federated Mut Ins Co","Nationwide","Liberty Mutual","Auto Owners","Cincinnati Ind Co","Wesco Ins Co"];
const PLACES = [
  { city: "Phoenix", state: "AZ", county: "Maricopa" },
  { city: "Mesa", state: "AZ", county: "Maricopa" },
  { city: "Tucson", state: "AZ", county: "Pima" },
  { city: "Glendale", state: "AZ", county: "Maricopa" },
  { city: "Cedar Rapids", state: "IA", county: "Linn" },
  { city: "Des Moines", state: "IA", county: "Polk" },
  { city: "Omaha", state: "NE", county: "Douglas" },
  { city: "Denver", state: "CO", county: "Denver" },
  { city: "Boise", state: "ID", county: "Ada" },
  { city: "Salt Lake City", state: "UT", county: "Salt Lake" },
  { city: "Wichita", state: "KS", county: "Sedgwick" },
  { city: "Fargo", state: "ND", county: "Cass" },
];
// Weighted the way a worked list actually looks: mostly untouched, a tail of
// dispositions, a handful of appointments.
const STATUS_MIX = [
  ...Array(34).fill("new"), ...Array(22).fill("xdate"), ...Array(12).fill("not_interested"),
  ...Array(8).fill("disconnected"), ...Array(6).fill("hot"), ...Array(5).fill("appt"),
  ...Array(4).fill("survey"), ...Array(3).fill("profile"), ...Array(2).fill("out_of_business"),
];

// Deterministic generator, so a re-run produces the same names.
let seed = 20260924;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = (list) => list[Math.floor(rnd() * list.length)];
const int = (min, max) => min + Math.floor(rnd() * (max - min + 1));
const iso = (daysFromNow) => new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);
const ampm = (h, m) => `${h > 12 ? h - 12 : h}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;

function makeLead() {
  const trade = pick(TRADES);
  const place = pick(PLACES);
  const suffix = pick(SUFFIXES);
  const name = `${pick(PREFIXES)} ${trade.word}${suffix ? ` ${suffix}` : ""}`;
  const contact = `${pick(FIRST)} ${pick(LAST)}`;
  const dm = rnd() > 0.45 ? `${pick(FIRST)} ${pick(LAST)}` : contact;
  const status = pick(STATUS_MIX);
  // 555 is the exchange reserved for fiction — nobody can dial these.
  const phone = `(${int(200, 989)}) 555-${String(int(100, 9999)).padStart(4, "0")}`;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");

  return {
    status,
    lead: {
      company_name: name,
      contact_name: contact,
      contact_title: pick(TITLES),
      decision_maker: dm,
      dm_title: pick(TITLES),
      phone,
      fax: rnd() > 0.82 ? `(${int(200, 989)}) 555-${String(int(100, 9999)).padStart(4, "0")}` : null,
      email: `office@${slug.slice(0, 18)}.example`,
      website: rnd() > 0.4 ? `https://www.${slug.slice(0, 18)}.example` : null,
      address: `${int(100, 9899)} ${pick(["N", "S", "E", "W"])} ${pick(["Main", "Oak", "Cactus", "Willow", "Ridge", "Mill", "Grand"])} ${pick(["St", "Ave", "Rd", "Ln", "Dr"])}`,
      city: place.city,
      state: place.state,
      zip: String(int(10000, 99999)),
      county: place.county,
      sic_code: trade.sic,
      description: trade.nature,
      location: String(int(1, 3)),
      employees: String(int(2, 85)),
      autos: String(int(1, 24)),
      covered_employees: rnd() > 0.6 ? String(int(1, 40)) : null,
      professionals: rnd() > 0.8 ? String(int(1, 12)) : null,
      years_in_business: String(int(2, 42)),
      producer_name: null, // filled from the project's manager
      list_source: SAMPLE_SOURCE,
      call_result_dbdv: { hot: "X-Date Hot Lead", xdate: "X-Date-Lead", survey: "Survey Appointment", not_interested: "Not Interested", disconnected: "Disconnected #", out_of_business: "Out of Business", profile: "X-Date Profile", appt: "X-Date-Lead", new: "Call 0" }[status],
      call_result_appt: status === "appt" ? "Phone Appointment" : status === "survey" ? "Appt From X-Date" : null,
    },
    insurance: {
      agency_name: rnd() > 0.5 ? pick(CARRIERS) : null,
      ultimate_xdate: rnd() > 0.72 ? iso(int(30, 520)) : null,
      pkg_xdate: iso(int(30, 520)),
      pkg_carrier: pick(CARRIERS),
      wc_xdate: iso(int(30, 520)),
      wc_carrier: pick(CARRIERS),
      auto_xdate: rnd() > 0.45 ? iso(int(30, 520)) : null,
      auto_carrier: rnd() > 0.45 ? pick(CARRIERS) : null,
      health_xdate: rnd() > 0.75 ? iso(int(30, 520)) : null,
      health_carrier: rnd() > 0.75 ? pick(CARRIERS) : null,
    },
    // Appointments land inside the next three weeks so the calendar has something.
    appointment: status === "appt" || status === "survey"
      ? { appt_date: iso(int(-6, 20)), appt_time: ampm(int(8, 16), pick([0, 30])) }
      : null,
  };
}

// --- go --------------------------------------------------------------------
console.log(`\nDatabase: ${URL_}`);
console.log(DRY_RUN ? "Mode:     DRY RUN — nothing will be written\n" : "Mode:     LIVE — sample data will be written\n");

const { data: projects, error: projectError } = await sb
  .from("projects")
  .select("id, name, company_id")
  .order("id");
if (projectError) {
  console.error(projectError.message);
  process.exit(1);
}

const targets = [];
for (const project of projects ?? []) {
  const { count } = await sb.from("leads").select("id", { count: "exact", head: true }).eq("project_id", project.id);
  if (count) {
    console.log(`  ${project.name.padEnd(42)} ${count} leads already — leaving alone`);
    continue;
  }
  targets.push({ ...project, want: int(140, 230) });
  console.log(`  ${project.name.padEnd(42)} empty — will add sample leads`);
}

if (targets.length === 0) {
  console.log("\nNothing to fill.\n");
  await agent.close();
  process.exit(0);
}

if (DRY_RUN) {
  console.log(`\nWould add sample leads to ${targets.length} project(s), plus QA, feedback, bulletin and document rows.`);
  console.log("Re-run with --confirm to write.\n");
  await agent.close();
  process.exit(0);
}

const { data: statusRows } = await sb.from("lead_statuses").select("id, code");
const statusId = Object.fromEntries((statusRows ?? []).map((r) => [r.code, r.id]));
const { data: apptStatuses } = await sb.from("appointment_statuses").select("id, name");
const apptStatusId = Object.fromEntries((apptStatuses ?? []).map((r) => [r.name, r.id]));
const { data: staff } = await sb.from("users").select("id, first_name, last_name").in("role", ["manager", "agent"]).order("id");
const { data: admin } = await sb.from("users").select("id").eq("role", "admin").limit(1).maybeSingle();
const { data: assignments } = await sb.from("project_assignments").select("project_id, ae_user_id");
const managerFor = Object.fromEntries((assignments ?? []).map((a) => [a.project_id, a.ae_user_id]));
const { data: natures } = await sb.from("nature_of_enquiry").select("id, name");
const { data: fbStatuses } = await sb.from("fb_statuses").select("id, name");

const now = new Date().toISOString();
const createdLeadIds = [];

console.log("\nAdding sample leads…");
for (const project of targets) {
  const managerId = managerFor[project.id] ?? staff?.[0]?.id ?? null;
  const manager = staff?.find((s) => s.id === managerId);
  const managerName = manager ? `${manager.first_name} ${manager.last_name}` : null;

  const generated = Array.from({ length: project.want }, makeLead);
  let made = 0;
  let appts = 0;

  for (let i = 0; i < generated.length; i += 200) {
    const chunk = generated.slice(i, i + 200);
    const payload = chunk.map(({ lead, status }) => ({
      ...lead,
      producer_name: managerName,
      project_id: project.id,
      status_id: statusId[status] ?? statusId.new,
      assigned_user_id: managerId,
      lead_date: now,
      import_date: now,
    }));

    const { data: inserted, error } = await sb.from("leads").insert(payload).select("id");
    if (error) {
      console.error(`  ${project.name}: ${error.message}`);
      process.exit(1);
    }
    made += inserted.length;
    inserted.forEach((r) => createdLeadIds.push({ id: r.id, project_id: project.id, user_id: managerId }));

    const insuranceRows = [];
    const appointmentRows = [];
    inserted.forEach((row, j) => {
      const src = chunk[j];
      if (src?.insurance) insuranceRows.push({ lead_id: row.id, ...src.insurance });
      if (src?.appointment) {
        appointmentRows.push({
          lead_id: row.id,
          user_id: managerId,
          appt_date: src.appointment.appt_date,
          appt_time: src.appointment.appt_time,
          status_id: apptStatusId[pick(["Scheduled", "Confirmed", "Held"])] ?? null,
          rep_name: managerName,
          list_source: SAMPLE_SOURCE,
          appt_create_date: now,
        });
      }
    });
    if (insuranceRows.length) await sb.from("insurance_details").insert(insuranceRows);
    if (appointmentRows.length) {
      const { error: apptError } = await sb.from("appointments").insert(appointmentRows);
      if (!apptError) appts += appointmentRows.length;
    }
  }

  await sb.from("import_batches").insert({
    file_name: `sample-${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.csv`,
    source: SAMPLE_SOURCE,
    project_id: project.id,
    row_count: made,
    imported_count: made,
    error_count: 0,
    status: "completed",
    imported_by: admin?.id ?? null,
  });

  console.log(`  ${project.name.padEnd(42)} ${made} leads, ${appts} appointments`);
}

// --- the screens that were empty ------------------------------------------
console.log("\nFilling the engagement screens…");

const CALL_RESULTS = ["Left voicemail", "Spoke with decision maker", "Call back requested", "Gatekeeper screened", "Wrong number", "Set appointment"];
const QA_RESULTS = ["Passed", "Passed", "Passed", "Review", "Failed"];
const callRows = [];
for (const lead of createdLeadIds.slice(0, 90)) {
  const score = int(58, 99);
  callRows.push({
    lead_id: lead.id,
    project_id: lead.project_id,
    user_id: lead.user_id,
    call_date: new Date(Date.now() - int(0, 27) * 86_400_000).toISOString(),
    call_result: pick(CALL_RESULTS),
    notes: "Sample record — generated for the demo, not a real call.",
    qa_score: score,
    qa_result: score >= 85 ? "Passed" : score >= 70 ? pick(QA_RESULTS) : "Failed",
    qa_date: new Date(Date.now() - int(0, 20) * 86_400_000).toISOString(),
  });
}
if (callRows.length) {
  const { error } = await sb.from("call_records").insert(callRows);
  console.log(`  call records / QA            ${error ? error.message : `${callRows.length} rows`}`);
}

const COMMENTS = [
  "Appointment was well qualified — the owner had his declarations pages ready.",
  "Renewal date was a month out from what the sheet said; worth a re-check.",
  "Good lead. Decision maker was the person we were told to ask for.",
  "Prospect had already renewed. Timing was off on this one.",
  "Rep was professional and the notes were accurate.",
  "Would like more detail on fleet size before the visit.",
];
const feedbackRows = createdLeadIds.slice(0, 14).map((lead, i) => ({
  lead_id: lead.id,
  user_id: lead.user_id,
  nature_id: natures?.[i % (natures?.length || 1)]?.id ?? null,
  fb_status_id: fbStatuses?.[i % (fbStatuses?.length || 1)]?.id ?? null,
  rating: int(3, 5),
  content: COMMENTS[i % COMMENTS.length],
  submitted_by: `${pick(FIRST)} ${pick(LAST)}`,
  created_at: new Date(Date.now() - int(0, 40) * 86_400_000).toISOString(),
}));
if (feedbackRows.length) {
  const { error } = await sb.from("feedback").insert(feedbackRows);
  console.log(`  client feedback              ${error ? error.message : `${feedbackRows.length} rows`}`);
}

const BULLETINS = [
  "Sample notice — the Q4 renewal push starts Monday; please clear your call-back queues.",
  "Sample notice — new list loaded for the Arizona contractors project.",
  "Sample notice — reminder to log declarations pages against the lead, not by email.",
  "Sample notice — the Cedar Rapids office is closed Friday for the holiday.",
  "Sample notice — two new carriers added to the comparison set this week.",
];
const bulletinRows = BULLETINS.map((message, i) => ({
  message,
  message_type: i === 0 ? "announcement" : "note",
  status: "active",
  user_id: admin?.id ?? null,
  created_at: new Date(Date.now() - i * 2 * 86_400_000).toISOString(),
}));
{
  const { error } = await sb.from("bulletin_board").insert(bulletinRows);
  console.log(`  bulletin board               ${error ? error.message : `${bulletinRows.length} rows`}`);
}

const { data: companies } = await sb.from("companies").select("id, name").order("id");
const DOCS = [
  ["Sample-Lead-Sheet-Template.pdf", "PDF", 184_320],
  ["Sample-Renewal-List-Q4.csv", "CSV", 96_100],
  ["Sample-Service-Agreement.docx", "DOCX", 48_600],
  ["Sample-Carrier-Appointment-Letter.pdf", "PDF", 122_880],
  ["Sample-Campaign-Brief.docx", "DOCX", 33_400],
  ["Sample-Call-Script.pdf", "PDF", 71_200],
];
const documentRows = DOCS.map(([name, type, size], i) => ({
  name,
  file_type: type,
  size_bytes: size,
  company_id: companies?.[i % (companies?.length || 1)]?.id ?? null,
  project_id: targets[i % targets.length]?.id ?? null,
  uploaded_by: admin?.id ?? null,
  created_at: new Date(Date.now() - int(1, 60) * 86_400_000).toISOString(),
}));
{
  const { error } = await sb.from("documents").insert(documentRows);
  console.log(`  documents                    ${error ? error.message : `${documentRows.length} rows`}`);
}

console.log("\nDone. Totals now:");
for (const table of ["companies", "projects", "leads", "insurance_details", "appointments", "call_records", "feedback", "bulletin_board", "documents", "import_batches"]) {
  const { count } = await sb.from(table).select("id", { count: "exact", head: true });
  console.log(`  ${table.padEnd(20)} ${count ?? 0} rows`);
}
console.log();
await agent.close();
