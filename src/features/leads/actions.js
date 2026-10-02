"use server";

/** Creating, editing and working leads. */

import { revalidatePath } from "next/cache";
import { NOT_DELETED, check, fail, idFrom, logActivity, n, ok, onlySubmitted, s } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { normalizeState } from "@/lib/csv";
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
    // "az" or "Arizona" is stored as "AZ", as the importer stores it, so one state is one value.
    state: normalizeState(s(formData, "state")) ?? s(formData, "state"),
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

