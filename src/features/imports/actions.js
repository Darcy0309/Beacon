"use server";

/** CSV lead import (the legacy Imports module). */

import { revalidatePath } from "next/cache";
import { MAX_IMPORT_MB, parseCsv, rowsToImport } from "@/lib/csv";
import { check, currentAppUser, fail, logActivity, n, ok, s } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { schemas } from "@/lib/validate";
import { sicCode, sicKey } from "@/lib/sic";

const MAX_CSV_BYTES = MAX_IMPORT_MB * 1024 * 1024;
// Leads per insert: each one is a round trip, and each is one statement the
// database must finish inside its time limit.
const IMPORT_CHUNK = 500;

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

  const supabase = await createClient();

  // Everything the import looks up, asked for at once rather than one after another.
  // The sheet's call-result columns place each name in the lifecycle. Old
  // and new result names both work (call_results.aliases holds the old ones).
  const [me, { data: project }, { data: statusRows }, { data: resultRows }, { data: apptStatus }] = await Promise.all([
    currentAppUser(supabase),
    supabase.from("projects").select("id, appt_project_id, type:project_types(code)").eq("id", projectId).maybeSingle(),
    supabase.from("lead_statuses").select("id, code"),
    supabase.from("call_results").select("id, project_type, name, aliases, viable, effect, status_code"),
    supabase.from("appointment_statuses").select("id").eq("name", "Scheduled").maybeSingle(),
  ]);
  if (!project) return fail("That project no longer exists.", { project_id: "Choose another project" });
  const projectType = (Array.isArray(project.type) ? project.type[0] : project.type)?.code === "APPT" ? "APPT" : "DBDV";

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
    const byDesc = new Map();
    // A request returns at most 1000 codes: the first page says how many
    // there are, and the rest are asked for together.
    const page = (from, opts) => supabase.from("sic_codes").select("code, description", opts).order("code").range(from, from + 999);
    const first = await page(0, { count: "exact" });
    const rest = await Promise.all(Array.from({ length: Math.max(0, Math.ceil((first.count ?? 0) / 1000) - 1) }, (_, k) => page((k + 1) * 1000)));
    for (const { data } of [first, ...rest]) {
      for (const r of data ?? []) {
        byCode.set(r.code, r.description);
        if (r.description && !byDesc.has(sicKey(r.description))) byDesc.set(sicKey(r.description), r.code);
      }
    }
    const fresh = new Map();
    for (const { lead } of parsed) {
      if (lead.sic_code) lead.sic_code = sicCode(lead.sic_code);
      const desc = lead.sic_description;
      delete lead.sic_description;
      if (!desc) continue;
      if (lead.sic_code) {
        if (!byCode.has(lead.sic_code) && !fresh.has(lead.sic_code)) fresh.set(lead.sic_code, desc);
      } else {
        const code = byDesc.get(sicKey(desc));
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

  if (imported === 0) return fail("No rows could be imported from that file.");

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
      row_count: rows.length - 1,
      imported_count: imported,
      error_count: errors,
      status: imported > 0 ? "completed" : "failed",
      imported_by: me?.id ?? null,
    }),
  ]);
  const assigned = splits.find((s) => s.id === projectId)?.reps ?? 0;
  if (batchError) return fail(batchError);

  await logActivity(supabase, "leads.import", {
    entity: "import",
    detail: `${imported} of ${rows.length - 1} rows from ${file.name}`,
  });
  revalidatePath("/imports");
  revalidatePath("/leads");
  revalidatePath("/work", "layout");
  revalidatePath("/");
  const unknown = [...unknownResults].sort((a, b) => b[1] - a[1]).map(([text, n]) => ({ text, n }));
  return ok({ imported, errors, details, appointments, assigned, total: rows.length - 1, unknown });
}
