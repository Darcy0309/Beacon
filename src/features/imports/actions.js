"use server";

/** CSV lead import (the legacy Imports module). */

import { revalidatePath } from "next/cache";
import { MAX_IMPORT_MB, parseCsv, rowsToImport } from "@/lib/csv";
import { removalMatcher } from "@/lib/dedupe";
import { check, currentAppUser, fail, logActivity, n, ok, s } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { schemas } from "@/lib/validate";
import { sicCode, sicMatcher } from "@/lib/sic";
import { fillPlaces } from "@/lib/server/zip-places";

const MAX_CSV_BYTES = MAX_IMPORT_MB * 1024 * 1024;
// Leads per insert: each one is a round trip, and each is one statement the
// database must finish inside its time limit.
const IMPORT_CHUNK = 500;
// The most duplicates one import records as Deletions.
const MAX_DROPPED = 20000;

/** Every row a query returns, a thousand at a time (a request returns at most 1000). */
async function allRows(query) {
  const first = await query(0, { count: "exact" });
  if (first.error) throw first.error;
  const rest = await Promise.all(Array.from({ length: Math.max(0, Math.ceil((first.count ?? 0) / 1000) - 1) }, (_, k) => query((k + 1) * 1000)));
  for (const r of rest) if (r.error) throw r.error;
  return [first, ...rest].flatMap((r) => r.data ?? []);
}

/** A client's removal list, as the import compares a new list with it. */
async function removalsOf(supabase, companyId) {
  if (!companyId) return [];
  return allRows((from, opts) => supabase.from("client_removals").select("source, reason, company_name, phone, ein, address, city, zip", opts)
    .eq("company_id", companyId).order("id").range(from, from + 999));
}

/**
 * The names already on a project's family (Oct 2026): the project, the
 * appointment project it promotes to (the client's "parent project") and
 * the parent's other lead projects. A new list for a renewal is checked
 * against them, so a business carried over, already a lead or an
 * appointment, or already called and ruled out there is not loaded twice:
 * the record there, with what was learned about it, is kept. Names Moved
 * on are left out (they are on the list they went to).
 */
async function familyNames(supabase, project) {
  const parent = project.type === "APPT" ? project.id : project.appt_project_id;
  let ids = [project.id];
  if (parent) {
    const { data, error } = await supabase.from("projects").select("id").eq("appt_project_id", parent).is("deleted_at", null);
    if (error) throw error;
    ids = [...new Set([project.id, parent, ...(data ?? []).map((p) => p.id)])];
  }
  return namesOn(supabase, ids, (p) => p.name);
}

// The most other clients' projects one import checks against.
const MAX_CHECK_PROJECTS = 300;

/**
 * The names on other clients' projects an import is checked against (Oct
 * 2026: the clients of one Agency Group in one territory, chosen on the
 * import): each with its client and project, to say where it already is.
 * The importing project's own client's projects are its family's business.
 */
async function otherNames(supabase, ids, companyId) {
  const list = [...new Set((ids ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, MAX_CHECK_PROJECTS);
  if (!list.length) return [];
  const { data, error } = await supabase.from("projects").select("id, company_id").in("id", list).is("deleted_at", null);
  if (error) throw error;
  const others = (data ?? []).filter((p) => p.company_id !== companyId).map((p) => p.id);
  return others.length ? namesOn(supabase, others, (p) => `${p.client} · ${p.name}`) : [];
}

/** The names on some projects, each with where it is (`label` of { name, client }) and its call result; names Moved on left out. */
async function namesOn(supabase, ids, label) {
  const [{ data: projects }, { data: results }] = await Promise.all([
    supabase.from("projects").select("id, name, company:companies(name)").in("id", ids),
    supabase.from("call_results").select("id, name"),
  ]);
  const one = (v) => (Array.isArray(v) ? v[0] : v);
  const where = new Map((projects ?? []).map((p) => [p.id, label({ name: p.name, client: one(p.company)?.name ?? "—" })]));
  const resultName = new Map((results ?? []).map((r) => [r.id, r.name]));
  const rows = await allRows((from, opts) => supabase.from("leads").select("company_name, phone, ein, address, city, zip, project_id, result_id", opts)
    .in("project_id", ids).is("deleted_at", null).order("id").range(from, from + 999));
  return rows
    .filter((r) => !/^(Lead-)?Moved$/.test(resultName.get(r.result_id) ?? ""))
    .map(({ project_id: pid, result_id: rid, ...r }) => ({ ...r, source: "lead", project: where.get(pid) ?? null, result: resultName.get(rid) ?? null }));
}

/** A project as the import needs it: its client, kind and appointment project. */
async function importProject(supabase, projectId) {
  const { data } = await supabase.from("projects").select("id, company_id, appt_project_id, company:companies(name), type:project_types(code)")
    .eq("id", Number(projectId) || 0).maybeSingle();
  if (!data) return null;
  const one = (v) => (Array.isArray(v) ? v[0] : v);
  return { ...data, client: one(data.company)?.name ?? null, type: one(data.type)?.code === "APPT" ? "APPT" : "DBDV" };
}

/**
 * Before an import (Oct 2026): the names the project's client has taken off
 * before, the names already on the project's family, and those on the other
 * clients' projects chosen (`checkIds`), for the preview to leave out and
 * list. The import checks them again.
 */
export async function importChecks(projectId, checkIds = []) {
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (me?.role !== "admin") return fail("Only administrators import lists.");
  const project = await importProject(supabase, projectId);
  if (!project) return fail("That project no longer exists.");
  try {
    const [removals, existing, others] = await Promise.all([
      removalsOf(supabase, project.company_id), familyNames(supabase, project), otherNames(supabase, checkIds, project.company_id),
    ]);
    return ok({ client: project.client, removals, existing, others });
  } catch (e) {
    return fail(e);
  }
}

/** The duplicates the preview left off, as Deletions on the client's list: the business's details only. */
function droppedRows(formData) {
  let list;
  try {
    list = JSON.parse(String(formData.get("dropped") || "[]"));
  } catch {
    return [];
  }
  const text = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  return (Array.isArray(list) ? list : []).slice(0, MAX_DROPPED).map((d) => ({
    company_name: text(d?.company_name, 200), contact_name: text(d?.contact_name, 200), phone: text(d?.phone, 40),
    ein: text(d?.ein, 20), address: text(d?.address, 200), city: text(d?.city, 100), state: text(d?.state, 2), zip: text(d?.zip, 10),
  })).filter((d) => d.company_name);
}

export async function importLeadsCsv(prevState, formData) {
  const { failed } = check(formData, schemas.csvImport);
  if (failed) return failed;

  const file = formData.get("file");
  if (!file || typeof file === "string" || file.size === 0) {
    return fail("Choose a CSV file to import.", { file: "Choose a file" });
  }
  if (!/\.csv$/i.test(file.name) && !/csv/i.test(file.type || "")) {
    return fail("Only .csv files can be imported.", { file: "Must be a .csv file" });
  }
  if (file.size > MAX_CSV_BYTES) {
    return fail(`That file is larger than ${MAX_IMPORT_MB} MB.`, { file: `Files must be ${MAX_IMPORT_MB} MB or smaller` });
  }

  const projectId = n(formData, "project_id");
  const listSource = s(formData, "list_source");

  let text;
  try {
    text = await file.text();
  } catch (e) {
    return fail(e);
  }

  const rows = parseCsv(text);
  if (rows.length < 2) return fail("That file has no data rows.");

  const { rows: parsed, errors: skipped, headers } = rowsToImport(rows);
  if (!headers.includes("company_name")) {
    return fail("No recognisable company column — expected a 'Company' heading.");
  }

  // A place half given (a ZIP and no county, a city and no ZIP…; Sean, Oct 2026): filled in where the rest says for certain.
  const places = await fillPlaces(parsed.map((r) => r.lead));

  const supabase = await createClient();

  // Everything the import looks up, asked for at once rather than one after another.
  // The sheet's call-result columns place each name in the lifecycle. Old
  // and new result names both work (call_results.aliases holds the old ones).
  const [me, { data: project }, { data: statusRows }, { data: resultRows }, { data: apptStatus }] = await Promise.all([
    currentAppUser(supabase),
    supabase.from("projects").select("id, company_id, appt_project_id, type:project_types(code)").eq("id", projectId).maybeSingle(),
    supabase.from("lead_statuses").select("id, code"),
    supabase.from("call_results").select("id, project_type, name, aliases, viable, effect, status_code"),
    supabase.from("appointment_statuses").select("id").eq("name", "Scheduled").maybeSingle(),
  ]);
  if (!project) return fail("That project no longer exists.", { project_id: "Choose another project" });
  const projectType = (Array.isArray(project.type) ? project.type[0] : project.type)?.code === "APPT" ? "APPT" : "DBDV";

  // Names the client has taken off before don't come back on a new list, and names already on the
  // project's family aren't loaded twice (the preview left them out; this makes sure).
  let removedBefore = 0;
  let existing = 0;
  let onOthers = 0;
  try {
    const [removals, family, others] = await Promise.all([
      removalsOf(supabase, project.company_id),
      familyNames(supabase, { id: project.id, appt_project_id: project.appt_project_id, type: projectType }),
      // The other clients' projects chosen to check against (an Agency Group's, in a territory).
      otherNames(supabase, String(formData.get("check_projects") ?? "").split(","), project.company_id),
    ]);
    const removed = removalMatcher(removals);
    const there = removalMatcher(family);
    const elsewhere = removalMatcher(others);
    const kept = [];
    for (const row of parsed) {
      if (removed(row.lead)) removedBefore++;
      else if (there(row.lead)) existing++;
      else if (elsewhere(row.lead)) onOthers++;
      else kept.push(row);
    }
    parsed.splice(0, parsed.length, ...kept);
  } catch (e) {
    return fail(e);
  }
  const dropped = droppedRows(formData);
  const duplicates = Math.max(dropped.length, Math.min(Number(formData.get("duplicates")) || 0, 1_000_000));

  const statusId = Object.fromEntries((statusRows ?? []).map((r) => [r.code, r.id]));
  // Every name and old name of every result, indexed once, so each row's
  // lookup is one step rather than a pass over the list. The first result to
  // claim a spelling keeps it, as a search through the list would find it.
  const resultIndex = new Map();
  for (const r of resultRows ?? []) {
    for (const spelling of [r.name.toLowerCase(), ...(r.aliases ?? [])]) {
      const key = `${r.project_type}|${spelling}`;
      if (!resultIndex.has(key)) resultIndex.set(key, r);
    }
  }
  const resultFor = (type, text) => {
    const t = String(text ?? "").trim().toLowerCase();
    return t ? resultIndex.get(`${type}|${t}`) ?? null : null;
  };
  const byName = (type, name) => (resultRows ?? []).find((r) => r.project_type === type && r.name === name);
  // A new name's first result on each stage, found once rather than per row.
  const firstResult = { DBDV: byName("DBDV", "Viable-CallBack"), APPT: byName("APPT", "Lead-No Contact") };

  // SIC: a code and a description in separate columns, either one missing. A
  // description finds its code in the SIC list; a code with a description
  // the list does not have yet is added to it.
  if (parsed.some(({ lead }) => lead.sic_description)) {
    const byCode = new Map();
    // A request returns at most 1000 codes: the first page says how many
    // there are, and the rest are asked for together.
    const page = (from, opts) => supabase.from("sic_codes").select("code, description", opts).order("code").range(from, from + 999);
    const first = await page(0, { count: "exact" });
    const rest = await Promise.all(Array.from({ length: Math.max(0, Math.ceil((first.count ?? 0) / 1000) - 1) }, (_, k) => page((k + 1) * 1000)));
    for (const { data } of [first, ...rest]) {
      for (const r of data ?? []) byCode.set(r.code, r.description);
    }
    // A description alone (the old system's records) finds its code: & and "and", NEC, the lists' short forms (sicMatcher).
    const codeFor = sicMatcher([...byCode].map(([code, description]) => ({ code, description })));
    const fresh = new Map();
    for (const { lead } of parsed) {
      if (lead.sic_code) lead.sic_code = sicCode(lead.sic_code);
      const desc = lead.sic_description;
      delete lead.sic_description;
      if (!desc) continue;
      if (lead.sic_code) {
        if (!byCode.has(lead.sic_code) && !fresh.has(lead.sic_code)) fresh.set(lead.sic_code, desc);
      } else {
        const code = codeFor(desc);
        if (code) lead.sic_code = code;
        // No code for it: keep the description on the lead rather than lose it.
        else lead.description ??= desc;
      }
    }
    if (fresh.size) {
      await supabase.from("sic_codes").upsert([...fresh].map(([code, description]) => ({ code, description })), { onConflict: "code", ignoreDuplicates: true });
    }
  }

  const now = new Date().toISOString();
  const unknownResults = new Map();
  let errors = skipped;
  let imported = 0;
  let details = 0;
  let appointments = 0;
  const childInserts = [];

  // A chunk's insurance, notes or appointments: how many went in.
  const insertChildren = async (table, list) => {
    if (!list.length) return 0;
    const { error: childError } = await supabase.from(table).insert(list);
    if (childError) console.error(`[import] ${table} rows failed:`, childError.message);
    return childError ? 0 : list.length;
  };

  // Insert in chunks so a large list does not blow the request limit. Each
  // chunk returns its new ids, which the insurance and appointment rows hang
  // off — so a lead's X-dates arrive with it rather than in a second pass
  // that could half-finish. The leads go in one chunk after another, in the
  // file's order: new names are called in id order, so that is the order the
  // list is called in. A chunk's other rows go in while the next chunk's
  // leads do, rather than holding them up.
  for (let i = 0; i < parsed.length; i += IMPORT_CHUNK) {
    const chunk = parsed.slice(i, i + IMPORT_CHUNK);
    const payload = chunk.map(({ lead, status }) => {
      let target = projectId;
      let stageType = projectType;
      const said = projectType === "DBDV" ? lead.call_result_dbdv : lead.call_result_appt;
      let result = resultFor(projectType, said);
      // A result the system does not know: the name starts at the stage's first; the import says which.
      if (said && !result) unknownResults.set(said.trim(), (unknownResults.get(said.trim()) ?? 0) + 1);
      let source = null;
      // A name the old system had already made a lead or an appointment
      // starts on the linked appointment project, like a promotion.
      if (projectType === "DBDV" && ["promote", "appointment"].includes(result?.effect) && project.appt_project_id) {
        target = project.appt_project_id;
        stageType = "APPT";
        source = projectId;
        result = resultFor("APPT", lead.call_result_appt)
          ?? byName("APPT", result.effect === "appointment" ? result.name : "Lead-No Contact");
      }
      // New names start on the client's first result: Viable-CallBack (DBDev) or Lead-No Contact (Appt).
      result ??= firstResult[stageType];
      return {
        ...lead,
        project_id: target,
        ...(source ? { source_project_id: source, promoted_at: now } : {}),
        result_id: result?.id ?? null,
        resolved_at: result && !result.viable ? now : null,
        status_id: statusId[result?.status_code] ?? statusId[status] ?? statusId.new ?? null,
        list_source: lead.list_source || listSource,
        lead_date: now,
        import_date: now,
      };
    });

    const { data: inserted, error } = await supabase.from("leads").insert(payload).select("id, project_id, stage");
    if (error || !inserted) {
      console.error("[import] lead chunk failed:", error?.message);
      errors += chunk.length;
      continue;
    }
    imported += inserted.length;

    // PostgREST returns the new rows in the order they were sent.
    const insuranceRows = [];
    const appointmentRows = [];
    const noteRows = [];
    inserted.forEach((row, j) => {
      const source = chunk[j];
      if (!source) return;
      if (source.insurance) insuranceRows.push({ lead_id: row.id, ...source.insurance });
      if (source.notes?.internal_notes) noteRows.push({ lead_id: row.id, notes: source.notes.internal_notes });
      if (source.appointment) {
        appointmentRows.push({
          lead_id: row.id,
          project_id: row.project_id,
          set_project_id: row.project_id,
          set_stage: row.stage,
          appt_date: source.appointment.appt_date,
          appt_time: source.appointment.appt_time ?? null,
          status_id: apptStatus?.id ?? null,
          rep_name: source.lead.producer_name ?? null,
          list_source: source.lead.list_source || listSource,
          appt_create_date: now,
        });
      }
    });

    childInserts.push(Promise.all([
      insertChildren("insurance_details", insuranceRows),
      // The internal notes, apart from the lead: staff only.
      insertChildren("lead_notes", noteRows),
      insertChildren("appointments", appointmentRows),
    ]));
  }
  // All in before the names are shared out, as the appointments' notices go to whoever holds a name then.
  for (const [ins, , appts] of await Promise.all(childInserts)) {
    details += ins;
    appointments += appts;
  }

  if (imported === 0 && parsed.length) return fail("No rows could be imported from that file.");

  // The duplicates left off, remembered as Deletions: a later list of this client's leaves those locations out.
  let deletions = 0;
  if (project.company_id && dropped.length) {
    for (let i = 0; i < dropped.length; i += IMPORT_CHUNK) {
      const { error: dropError } = await supabase.from("client_removals").insert(dropped.slice(i, i + IMPORT_CHUNK).map((d) => ({
        ...d, company_id: project.company_id, reason: "deletion", source: "import", note: `Duplicate left off ${file.name}`, removed_by: me?.id ?? null,
      })));
      if (dropError) console.error("[import] deletions failed:", dropError.message);
      else deletions += Math.min(IMPORT_CHUNK, dropped.length - i);
    }
  }

  // Share the new names out across each project's account managers (each
  // project on its own, so both at once), and record the batch meanwhile.
  const [splits, { error: batchError }] = await Promise.all([
    Promise.all([...new Set([projectId, project.appt_project_id].filter(Boolean))].map(async (id) => {
      const { data: split, error: splitError } = await supabase.rpc("distribute_project_names", { p_project_id: id });
      if (splitError) console.error("[import] distribution failed:", splitError.message);
      return { id, reps: splitError ? 0 : split?.reps ?? 0 };
    })),
    supabase.from("import_batches").insert({
      file_name: file.name,
      source: listSource,
      project_id: projectId,
      row_count: rows.length - 1 + duplicates,
      imported_count: imported,
      error_count: errors,
      duplicate_count: duplicates,
      removed_count: removedBefore,
      existing_count: existing,
      other_count: onOthers,
      status: imported > 0 ? "completed" : "failed",
      imported_by: me?.id ?? null,
    }),
  ]);
  const assigned = splits.find((s) => s.id === projectId)?.reps ?? 0;
  if (batchError) return fail(batchError);

  await logActivity(supabase, "leads.import", {
    entity: "import",
    detail: `${imported} of ${rows.length - 1 + duplicates} rows from ${file.name}${duplicates ? `, ${duplicates} duplicates left off` : ""}${removedBefore ? `, ${removedBefore} taken off before` : ""}${existing ? `, ${existing} already on the project` : ""}${onOthers ? `, ${onOthers} on other clients' lists` : ""}`,
  });
  revalidatePath("/imports");
  revalidatePath("/leads");
  revalidatePath("/work", "layout");
  revalidatePath("/");
  const unknown = [...unknownResults].sort((a, b) => b[1] - a[1]).map(([text, n]) => ({ text, n }));
  return ok({ imported, errors, details, appointments, assigned, total: rows.length - 1 + duplicates, unknown, duplicates, deletions, removed: removedBefore, existing, others: onOthers, places });
}
