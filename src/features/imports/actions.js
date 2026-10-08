"use server";

/** CSV lead import (the legacy Imports module). */

import { revalidatePath } from "next/cache";
import { parseCsv, rowsToImport } from "@/lib/csv";
import { check, currentAppUser, fail, logActivity, n, ok, s } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { schemas } from "@/lib/validate";

const MAX_CSV_BYTES = 5 * 1024 * 1024;

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
    return fail("That file is larger than 5 MB.", { file: "Files must be 5 MB or smaller" });
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
  const me = await currentAppUser(supabase);

  const { data: project } = await supabase
    .from("projects")
    .select("id, appt_project_id, type:project_types(code)")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return fail("That project no longer exists.", { project_id: "Choose another project" });
  const projectType = (Array.isArray(project.type) ? project.type[0] : project.type)?.code === "APPT" ? "APPT" : "DBDV";

  // The sheet's call-result columns place each name in the lifecycle. Old
  // and new result names both work (call_results.aliases holds the old ones).
  const [{ data: statusRows }, { data: resultRows }] = await Promise.all([
    supabase.from("lead_statuses").select("id, code"),
    supabase.from("call_results").select("id, project_type, name, aliases, viable, effect, status_code"),
  ]);
  const statusId = Object.fromEntries((statusRows ?? []).map((r) => [r.code, r.id]));
  const resultFor = (type, text) => {
    const t = String(text ?? "").trim().toLowerCase();
    if (!t) return null;
    return (resultRows ?? []).find((r) => r.project_type === type && (r.name.toLowerCase() === t || (r.aliases ?? []).includes(t))) ?? null;
  };
  const byName = (type, name) => (resultRows ?? []).find((r) => r.project_type === type && r.name === name);

  const { data: apptStatus } = await supabase
    .from("appointment_statuses")
    .select("id")
    .eq("name", "Scheduled")
    .maybeSingle();

  const now = new Date().toISOString();
  let errors = skipped;
  let imported = 0;
  let details = 0;
  let appointments = 0;

  // Insert in chunks so a large list does not blow the request limit. Each
  // chunk returns its new ids, which the insurance and appointment rows hang
  // off — so a lead's X-dates arrive with it rather than in a second pass
  // that could half-finish.
  for (let i = 0; i < parsed.length; i += 250) {
    const chunk = parsed.slice(i, i + 250);
    const payload = chunk.map(({ lead, status }) => {
      let target = projectId;
      let stageType = projectType;
      let result = resultFor(projectType, projectType === "DBDV" ? lead.call_result_dbdv : lead.call_result_appt);
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
      result ??= byName(stageType, stageType === "DBDV" ? "Viable-CallBack" : "Lead-No Contact");
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

    if (insuranceRows.length) {
      const { error: insError } = await supabase.from("insurance_details").insert(insuranceRows);
      if (insError) console.error("[import] insurance rows failed:", insError.message);
      else details += insuranceRows.length;
    }
    // The internal notes, apart from the lead: staff only.
    if (noteRows.length) {
      const { error: notesError } = await supabase.from("lead_notes").insert(noteRows);
      if (notesError) console.error("[import] lead notes failed:", notesError.message);
    }
    if (appointmentRows.length) {
      const { error: apptError } = await supabase.from("appointments").insert(appointmentRows);
      if (apptError) console.error("[import] appointment rows failed:", apptError.message);
      else appointments += appointmentRows.length;
    }
  }

  if (imported === 0) return fail("No rows could be imported from that file.");

  // Share the new names out across each project's account managers.
  let assigned = 0;
  for (const id of new Set([projectId, project.appt_project_id].filter(Boolean))) {
    const { data: split, error: splitError } = await supabase.rpc("distribute_project_names", { p_project_id: id });
    if (splitError) console.error("[import] distribution failed:", splitError.message);
    else if (id === projectId) assigned = split?.reps ?? 0;
  }

  const { error: batchError } = await supabase.from("import_batches").insert({
    file_name: file.name,
    source: listSource,
    project_id: projectId,
    row_count: rows.length - 1,
    imported_count: imported,
    error_count: errors,
    status: imported > 0 ? "completed" : "failed",
    imported_by: me?.id ?? null,
  });
  if (batchError) return fail(batchError);

  await logActivity(supabase, "leads.import", {
    entity: "import",
    detail: `${imported} of ${rows.length - 1} rows from ${file.name}`,
  });
  revalidatePath("/imports");
  revalidatePath("/leads");
  revalidatePath("/work", "layout");
  revalidatePath("/");
  return ok({ imported, errors, details, appointments, assigned, total: rows.length - 1 });
}
