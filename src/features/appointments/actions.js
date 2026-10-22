"use server";

/** Setting and managing appointments. */

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { check, currentAppUser, fail, idFrom, n, ok, removeRecord, requestOrigin, s } from "@/lib/server/action-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { flushOutbox } from "@/lib/server/outbox";
import { createClient } from "@/lib/supabase/server";
import { cross, schemas } from "@/lib/validate";
import { STATUS_KEYS, parseAmount, soldLines } from "@/lib/appointment-updates";

export async function createAppointment(prevState, formData) {
  const { values, failed } = check(formData, schemas.appointment, cross.appointment);
  if (failed) return failed;

  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  const leadId = Number(values.lead_id);
  const apptDate = values.appt_date;
  // An appointment belongs to the project its lead is on, like one set from a call.
  const { data: lead } = await supabase.from("leads").select("project_id, stage").eq("id", leadId).maybeSingle();

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      lead_id: leadId,
      project_id: lead?.project_id ?? null,
      set_project_id: lead?.project_id ?? null,
      set_stage: lead?.stage ?? null,
      user_id: n(formData, "user_id") ?? me?.id ?? null,
      rep_name: s(formData, "rep_name"),
      appt_date: apptDate,
      appt_time: s(formData, "appt_time"),
      duration_min: n(formData, "duration_min") ?? 30,
      status_id: n(formData, "status_id"),
      list_source: s(formData, "list_source"),
      // Like one set from a call: the client sees and hears of it once QA passes it.
      qa_status: "pending",
    })
    .select("id")
    .single();
  if (error) return fail(error);

  // "Client notes": saved on the lead, where the lead sheet sends them from.
  // A note the form started from the lead's own is saved as it stands, even
  // emptied; otherwise only a note written here.
  const note = s(formData, "client_note");
  const noteKnown = formData.get("client_note_known") === "1";
  await supabase
    .from("leads")
    .update({ appt_created_date: new Date().toISOString(), ...(note || noteKnown ? { client_note: note } : {}) })
    .eq("id", leadId);

  revalidatePath("/appointments");
  revalidatePath("/calendar");
  revalidatePath("/");
  return ok(data);
}

export async function updateAppointment(prevState, formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing appointment id.");
  // lead_id is fixed on an existing appointment, so it is not part of this form.
  const { lead_id: _omit, ...editSchema } = schemas.appointment;
  const { failed } = check(formData, editSchema, cross.appointment);
  if (failed) return failed;

  const supabase = await createClient();
  const { error } = await supabase
    .from("appointments")
    .update({
      appt_date: s(formData, "appt_date"),
      appt_time: s(formData, "appt_time"),
      duration_min: n(formData, "duration_min") ?? 30,
      status_id: n(formData, "status_id"),
      rep_name: s(formData, "rep_name"),
      status_update_date: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return fail(error);

  revalidatePath("/appointments");
  revalidatePath("/calendar");
  return ok({ id });
}

export async function setAppointmentStatus(formData) {
  const id = idFrom(formData);
  const statusId = idFrom(formData, "status_id");
  if (!id || !statusId) return fail("Missing appointment or status.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ status_id: statusId, status_update_date: new Date().toISOString() })
    .eq("id", id);
  if (error) return fail(error);
  revalidatePath("/appointments");
  revalidatePath("/calendar");
  return ok({ id });
}

export async function deleteAppointment(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing appointment id.");
  const supabase = await createClient();
  const problem = await removeRecord(supabase, "appointments", id);
  if (problem) return fail(problem);
  revalidatePath("/appointments");
  revalidatePath("/calendar");
  return ok({ id });
}

/**
 * A client's update to an appointment (Sean, Oct 2026): its status, a note,
 * the potential premium while Valid-Quoting, and for Sold Account each
 * policy line's premium and carrier (`lines`: JSON from the form). The
 * database checks it is theirs, keeps the update and tells the
 * administrators and the manager who set it.
 */
export async function updateAppointmentStatus(prevState, formData) {
  const id = idFrom(formData, "appointment_id");
  if (!id) return fail("Missing appointment.");
  const status = s(formData, "status");
  if (!STATUS_KEYS.includes(status ?? "")) return fail("Choose how the appointment went", { status: "Choose one" });
  const note = s(formData, "note");
  if ((note ?? "").length > 2000) return fail("Keep the note under 2,000 characters", { note: "Under 2,000 characters" });
  let potential = null;
  let lines = null;
  if (status === "valid_quoting") {
    potential = parseAmount(s(formData, "potential_premium"));
    if (Number.isNaN(potential)) return fail("Enter the potential premium as an amount", { potential_premium: "An amount, like 12,500" });
  }
  if (status === "sold") {
    let boxes = {};
    try {
      boxes = JSON.parse(String(formData.get("lines") ?? "{}"));
    } catch {
      return fail("Enter the premium on each policy line sold");
    }
    const sold = soldLines(boxes);
    if (sold.error) return fail(sold.error, { lines: sold.error });
    lines = sold.lines;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_appointment_status", {
    p_appointment_id: id, p_status: status, p_note: note, p_potential_premium: potential, p_sold_lines: lines,
  });
  if (error) return fail(error);
  // Its emails (to the administrators and the manager who set it) go out at once, after the answer.
  const origin = await requestOrigin();
  after(async () => {
    const admin = createAdminClient();
    if (admin) await flushOutbox(admin, origin).catch((err) => console.error("[outbox]", err?.message ?? err));
  });
  const leadId = idFrom(formData, "lead_id");
  revalidatePath("/appointments");
  revalidatePath("/");
  if (leadId) revalidatePath(`/leads/${leadId}`);
  return ok(data);
}
