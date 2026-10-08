"use server";

/** Creating, editing and working leads. */

import { revalidatePath } from "next/cache";
import { NOT_DELETED, check, fail, idFrom, logActivity, n, ok, onlySubmitted, s } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { normalizeEin, normalizeState } from "@/lib/csv";
import { schemas } from "@/lib/validate";
import { POLICY_LINES } from "@/lib/coverage";

function leadPayload(formData) {
  return {
    company_name: s(formData, "company_name"),
    contact_name: s(formData, "contact_name"),
    contact_title: s(formData, "contact_title"),
    phone: s(formData, "phone"),
    contact_mobile: s(formData, "contact_mobile"),
    email: s(formData, "email"),
    decision_maker: s(formData, "decision_maker"),
    dm_title: s(formData, "dm_title"),
    dm_phone: s(formData, "dm_phone"),
    dm_mobile: s(formData, "dm_mobile"),
    dm_email: s(formData, "dm_email"),
    contact2_name: s(formData, "contact2_name"),
    contact2_title: s(formData, "contact2_title"),
    contact2_phone: s(formData, "contact2_phone"),
    contact2_mobile: s(formData, "contact2_mobile"),
    contact2_email: s(formData, "contact2_email"),
    producer_name: s(formData, "producer_name"),
    website: s(formData, "website"),
    address: s(formData, "address"),
    city: s(formData, "city"),
    // "az" or "Arizona" is stored as "AZ", as the importer stores it, so one state is one value.
    state: normalizeState(s(formData, "state")) ?? s(formData, "state"),
    zip: s(formData, "zip"),
    county: s(formData, "county"),
    sic_code: s(formData, "sic_code"),
    description: s(formData, "description"),
    list_source: s(formData, "list_source"),
    location: s(formData, "location"),
    employees: s(formData, "employees"),
    covered_employees: s(formData, "covered_employees"),
    autos: s(formData, "autos"),
    sales_volume: s(formData, "sales_volume"),
    // Written one way, "12-3456789", however it was typed.
    ein: normalizeEin(s(formData, "ein")),
    years_in_business: s(formData, "years_in_business"),
    estimated_annual_premium: s(formData, "estimated_annual_premium"),
    client_note: s(formData, "client_note"),
    status_id: n(formData, "status_id"),
    project_id: n(formData, "project_id"),
    agency_id: n(formData, "agency_id"),
    assigned_user_id: n(formData, "assigned_user_id"),
  };
}

/**
 * The lead's internal notes, kept apart from it (lead_notes, which only
 * staff may read): saved when the form sent them.
 */
async function saveInternalNotes(supabase, leadId, formData) {
  if (!formData.has("internal_notes")) return null;
  const { error } = await supabase.from("lead_notes").upsert({ lead_id: leadId, notes: s(formData, "internal_notes") }, { onConflict: "lead_id" });
  return error;
}

export async function createLead(prevState, formData) {
  const { failed } = check(formData, schemas.lead);
  if (failed) return failed;

  const supabase = await createClient();
  const payload = leadPayload(formData);
  // A lead saved without a status is New, so it is counted and filtered as New too.
  if (!payload.status_id) {
    const { data: fresh } = await supabase.from("lead_statuses").select("id").eq("code", "new").maybeSingle();
    payload.status_id = fresh?.id ?? null;
  }

  const { data, error } = await supabase
    .from("leads")
    .insert({ ...payload, lead_date: new Date().toISOString() })
    .select("id")
    .single();
  if (error) return fail(error);
  const notesError = await saveInternalNotes(supabase, data.id, formData);
  if (notesError) return fail(notesError);

  await logActivity(supabase, "lead.create", { entity: "lead", entityId: data?.id, detail: payload.company_name });
  revalidatePath("/leads");
  revalidatePath("/");
  return ok(data);
}

export async function updateLead(prevState, formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing lead id.");
  const { failed } = check(formData, schemas.lead);
  if (failed) return failed;

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    // Editing the record is not working the name: only a call (record_call_result) sets date_last_worked.
    .update(onlySubmitted(formData, leadPayload(formData)))
    .eq("id", id);
  if (error) return fail(error);
  const notesError = await saveInternalNotes(supabase, id, formData);
  if (notesError) return fail(notesError);

  await logActivity(supabase, "lead.update", { entity: "lead", entityId: id });
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  return ok({ id });
}

export async function deleteLead(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing lead id.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").delete().eq("id", id).select("id");
  if (error) return fail(error);
  if (!data?.length) return fail(NOT_DELETED);
  await logActivity(supabase, "lead.delete", { entity: "lead", entityId: id });
  revalidatePath("/leads");
  return ok({ id });
}

/** Quick inline status change from the leads table. */
export async function setLeadStatus(formData) {
  const id = idFrom(formData);
  const statusId = idFrom(formData, "status_id");
  if (!id || !statusId) return fail("Missing lead or status.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ status_id: statusId, date_last_worked: new Date().toISOString() })
    .eq("id", id);
  if (error) return fail(error);
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  return ok({ id });
}


/**
 * Save a name's coverage from the lead sheet's Coverage tab: its Ultimate
 * X-Date, the prospect's agency, and each policy line's X-date and carrier.
 * For whoever may work the name, as recording a result is.
 */
export async function saveCoverage(prevState, formData) {
  const { values, failed } = check(formData, schemas.coverage);
  if (failed) return failed;
  const leadId = Number(values.lead_id);

  const supabase = await createClient();
  const { data: allowed, error: notAllowed } = await supabase.rpc("can_work_lead", { p_lead_id: leadId });
  if (notAllowed) return fail(notAllowed, null, values);
  if (!allowed) return fail("This name is not on your call list, so you can't change its coverage.", null, values);

  const payload = { ultimate_xdate: values.ultimate_xdate || null, agency_name: values.agency_name || null };
  for (const line of POLICY_LINES) {
    payload[line.date] = values[line.date] || null;
    payload[line.carrier] = values[line.carrier] || null;
  }
  const { data: rows, error } = await supabase.from("insurance_details").update(payload).eq("lead_id", leadId).select("id");
  if (error) return fail(error, null, values);
  if (!rows?.length) {
    const { error: added } = await supabase.from("insurance_details").insert({ lead_id: leadId, ...payload });
    if (added) return fail(added, null, values);
  }

  await logActivity(supabase, "lead.coverage", { entity: "lead", entityId: leadId });
  revalidatePath(`/leads/${leadId}`);
  return ok({ id: leadId });
}

/**
 * Remind me to call this name back, at a day and time on the business's
 * clock: set_reminder() checks I may work the name and that the time is
 * still ahead; at that time a notification links me to the lead.
 */
export async function setReminder(prevState, formData) {
  const { values, failed } = check(formData, schemas.reminder);
  if (failed) return failed;
  const leadId = Number(values.lead_id);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_reminder", {
    p_lead_id: leadId, p_date: values.remind_date, p_time: values.remind_time, p_note: values.note || null,
  });
  if (error) {
    const field = /time|passed/i.test(error.message) ? "remind_time" : /day/i.test(error.message) ? "remind_date" : null;
    return fail(error, field ? { [field]: error.message } : null, values);
  }
  await logActivity(supabase, "lead.reminder", { entity: "lead", entityId: leadId, detail: `${values.remind_date} ${values.remind_time}` });
  revalidatePath(`/leads/${leadId}`);
  return ok(data);
}

/** Cancel one of my reminders before it goes off. */
export async function cancelReminder(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing reminder.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_reminder", { p_id: id });
  if (error) return fail(error);
  const leadId = idFrom(formData, "lead_id");
  if (leadId) revalidatePath(`/leads/${leadId}`);
  return ok({ id });
}

/**
 * One of a lead's two notes, edited in place on its Notes tab: the client
 * notes (on the lead, which the client sees; staff write them) or the
 * internal notes (lead_notes: administrators and managers alone). The
 * database says who may.
 */
export async function saveLeadNote(prevState, formData) {
  const { values, failed } = check(formData, schemas.leadNote);
  if (failed) return failed;
  const leadId = Number(values.lead_id);
  const text = s(formData, "text");
  if (values.kind === "client" && (text ?? "").length > 2000) return fail("Keep client notes under 2,000 characters.", { text: "Keep client notes under 2,000 characters" });
  const supabase = await createClient();
  const { data, error } = values.kind === "client"
    ? await supabase.from("leads").update({ client_note: text }).eq("id", leadId).select("id")
    : await supabase.from("lead_notes").upsert({ lead_id: leadId, notes: text }, { onConflict: "lead_id" }).select("lead_id");
  if (error) return fail(error);
  if (!data?.length) return fail("You can't change this lead's notes.");

  await logActivity(supabase, "lead.notes", { entity: "lead", entityId: leadId, detail: values.kind === "client" ? "Client notes" : "Internal notes" });
  revalidatePath(`/leads/${leadId}`);
  return ok({ kind: values.kind });
}
