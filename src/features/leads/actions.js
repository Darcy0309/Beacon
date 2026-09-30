"use server";

/** Creating, editing and working leads. */

import { revalidatePath } from "next/cache";
import { NOT_DELETED, check, currentAppUser, fail, idFrom, logActivity, n, ok, onlySubmitted, s } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { schemas } from "@/lib/validate";

function leadPayload(formData) {
  return {
    company_name: s(formData, "company_name"),
    contact_name: s(formData, "contact_name"),
    contact_title: s(formData, "contact_title"),
    phone: s(formData, "phone"),
    email: s(formData, "email"),
    website: s(formData, "website"),
    address: s(formData, "address"),
    city: s(formData, "city"),
    state: s(formData, "state"),
    zip: s(formData, "zip"),
    county: s(formData, "county"),
    sic_code: s(formData, "sic_code"),
    description: s(formData, "description"),
    list_source: s(formData, "list_source"),
    employees: s(formData, "employees"),
    covered_employees: s(formData, "covered_employees"),
    autos: s(formData, "autos"),
    sales_volume: s(formData, "sales_volume"),
    years_in_business: s(formData, "years_in_business"),
    estimated_annual_premium: s(formData, "estimated_annual_premium"),
    notes_dcm: s(formData, "notes_dcm"),
    notes_client: s(formData, "notes_client"),
    status_id: n(formData, "status_id"),
    project_id: n(formData, "project_id"),
    agency_id: n(formData, "agency_id"),
    assigned_user_id: n(formData, "assigned_user_id"),
  };
}

export async function createLead(prevState, formData) {
  const { failed } = check(formData, schemas.lead);
  if (failed) return failed;

  const supabase = await createClient();
  const payload = leadPayload(formData);

  const { data, error } = await supabase
    .from("leads")
    .insert({ ...payload, lead_date: new Date().toISOString() })
    .select("id")
    .single();
  if (error) return fail(error);

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
    .update({ ...onlySubmitted(formData, leadPayload(formData)), date_last_worked: new Date().toISOString() })
    .eq("id", id);
  if (error) return fail(error);

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

/** Log a call against a lead (the legacy tblCallRecord behaviour). */
export async function logCall(prevState, formData) {
  const { values, failed } = check(formData, schemas.call);
  if (failed) return failed;

  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  const leadId = Number(values.lead_id);

  const { error } = await supabase.from("call_records").insert({
    lead_id: leadId,
    project_id: n(formData, "project_id"),
    user_id: me?.id ?? null,
    call_result: s(formData, "call_result"),
    notes: s(formData, "notes"),
  });
  if (error) return fail(error);

  await supabase
    .from("leads")
    .update({
      date_last_worked: new Date().toISOString(),
      call_result_dbdv: s(formData, "call_result"),
    })
    .eq("id", leadId);

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/qa");
  return ok();
}
