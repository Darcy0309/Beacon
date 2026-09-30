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

  // The sheet's call results decide the status; "New" covers anything else.
  const { data: statusRows } = await supabase.from("lead_statuses").select("id, code");
  const statusId = Object.fromEntries((statusRows ?? []).map((r) => [r.code, r.id]));

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
    const payload = chunk.map(({ lead, status }) => ({
      ...lead,
      project_id: projectId,
      status_id: statusId[status] ?? statusId.new ?? null,
      list_source: lead.list_source || listSource,
      lead_date: now,
      import_date: now,
    }));

    const { data: inserted, error } = await supabase.from("leads").insert(payload).select("id");
    if (error || !inserted) {
      console.error("[import] lead chunk failed:", error?.message);
      errors += chunk.length;
      continue;
    }
    imported += inserted.length;

    // PostgREST returns the new rows in the order they were sent.
    const insuranceRows = [];
    const appointmentRows = [];
    inserted.forEach((row, j) => {
      const source = chunk[j];
      if (!source) return;
      if (source.insurance) insuranceRows.push({ lead_id: row.id, ...source.insurance });
      if (source.appointment) {
        appointmentRows.push({
          lead_id: row.id,
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
    if (appointmentRows.length) {
      const { error: apptError } = await supabase.from("appointments").insert(appointmentRows);
      if (apptError) console.error("[import] appointment rows failed:", apptError.message);
      else appointments += appointmentRows.length;
    }
  }

  if (imported === 0) return fail("No rows could be imported from that file.");

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
  revalidatePath("/");
  return ok({ imported, errors, details, appointments, total: rows.length - 1 });
}
