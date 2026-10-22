"use server";

/** Projects. */

import { revalidatePath } from "next/cache";
import { check, deleteRow, fail, idFrom, logActivity, n, ok, onlySubmitted, s } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { carryInfoOnTie } from "@/features/project-info/server";
import { cross, formValues, schemas } from "@/lib/validate";

export async function saveProject(prevState, formData) {
  const { failed } = check(formData, schemas.project, cross.project);
  if (failed) return failed;

  const supabase = await createClient();
  const id = idFrom(formData);
  const payload = {
    name: s(formData, "name"),
    company_id: n(formData, "company_id"),
    project_type_id: n(formData, "project_type_id"),
    status_id: n(formData, "status_id"),
    // Which appointment project a DBDev project's leads are promoted to.
    appt_project_id: n(formData, "appt_project_id"),
    description: s(formData, "description"),
    client_name: s(formData, "client_name"),
    start_date: s(formData, "start_date"),
    end_date: s(formData, "end_date"),
    // Its goals for those dates (the old project questionnaire's lead and appointment goals).
    lead_goal: n(formData, "lead_goal"),
    appt_goal: n(formData, "appt_goal"),
    amount_paid: n(formData, "amount_paid"),
    email: s(formData, "email"),
    // A checkbox sends nothing when unticked; the hidden "off" before it always does.
    delivery_link_only: formData.getAll("delivery_link_only").includes("on"),
    // Its office: the agent (producer), phone, address and time zone.
    contact_name: s(formData, "contact_name"),
    contact_title: s(formData, "contact_title"),
    phone: s(formData, "phone"),
    address: s(formData, "address"),
    city: s(formData, "city"),
    state: s(formData, "state")?.toUpperCase() ?? null,
    zip: s(formData, "zip"),
    timezone_id: n(formData, "timezone_id"),
  };
  const { data: saved, error } = id
    ? await supabase.from("projects").update(onlySubmitted(formData, payload)).eq("id", id).select("id").maybeSingle()
    : await supabase.from("projects").insert(payload).select("id").maybeSingle();
  if (error) return fail(error, null, formValues(formData, Object.keys(schemas.project)));
  // Tied to an appointment project, whichever was made first: Project Info filled in here goes to the shared sheet
  // when that one has none yet (Sean, Oct 2026).
  const admin = payload.appt_project_id && saved?.id ? createAdminClient() : null;
  if (admin) await carryInfoOnTie(admin, saved.id, payload.appt_project_id);

  await logActivity(supabase, id ? "project.update" : "project.create", { entity: "project", entityId: id ?? null });
  // A project's office shows on its page, its call lists and its lead sheets.
  revalidatePath("/projects", "layout");
  revalidatePath("/work", "layout");
  return ok();
}

export async function deleteProject(formData) {
  // Its leads and their appointments go with it, and come back with it.
  const result = await deleteRow("projects", formData, ["/projects", "/clients", "/leads", "/appointments", "/calendar"], { action: "project.delete", entity: "project", name: "name" });
  if (result.ok) revalidatePath("/work", "layout");
  return result;
}

/** "12 names moved" — what a re-share did, for the toast. */
function sharedOut(result) {
  if (!result?.reps) return "Nobody is on this project now, so its names wait unassigned.";
  const moved = Number(result.moved ?? 0);
  const each = Math.floor(Number(result.names ?? 0) / result.reps);
  return `${moved ? `${moved} name${moved === 1 ? "" : "s"} moved` : "Already even"} · about ${each} each across ${result.reps} rep${result.reps === 1 ? "" : "s"}`;
}

/**
 * Put a rep on a project (on=1) or take them off (on=0). The project's names
 * still to call are then shared out evenly again, in the same transaction.
 */
export async function setProjectRep(formData) {
  const projectId = idFrom(formData, "project_id");
  const userId = idFrom(formData, "user_id");
  const on = formData.get("on") === "1";
  if (!projectId || !userId) return fail("Choose who to add");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_project_rep", { p_project_id: projectId, p_user_id: userId, p_on: on });
  if (error) return fail(error);

  await logActivity(supabase, on ? "project.rep_add" : "project.rep_remove", {
    entity: "project", entityId: projectId, detail: `user ${userId} · ${data?.moved ?? 0} names moved`,
  });
  revalidatePath(`/projects/${projectId}`);
  return ok({ message: sharedOut(data) });
}

/** Share a project's names still to call evenly across its reps again. */
export async function redistributeProject(formData) {
  const projectId = idFrom(formData, "project_id");
  if (!projectId) return fail("That project no longer exists");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("distribute_project_names", { p_project_id: projectId });
  if (error) return fail(error);

  await logActivity(supabase, "project.redistribute", { entity: "project", entityId: projectId, detail: `${data?.moved ?? 0} names moved` });
  revalidatePath(`/projects/${projectId}`);
  return ok({ message: sharedOut(data) });
}

/** An administrator sets one project's pay rates (USD per lead, appointment, confirmation). */
export async function saveProjectRates(prevState, formData) {
  const { failed } = check(formData, schemas.projectRates);
  if (failed) return failed;
  const projectId = idFrom(formData, "project_id");
  if (!projectId) return fail("That project no longer exists");

  const supabase = await createClient();
  // "$12.50" and "1,000" are fine; a blank rate is $0.
  const rate = (key) => Number(String(formData.get(key) ?? "").replace(/[$,\s]/g, "")) || 0;
  const { data, error } = await supabase.rpc("set_project_rates", {
    p_project_id: projectId,
    p_lead: rate("lead_rate"),
    p_appointment: rate("appointment_rate"),
    p_confirmation: rate("confirmation_rate"),
  });
  if (error) {
    // A rate outside its range in Settings: say so beside that rate.
    const field = [[/^Lead pay/, "lead_rate"], [/^Appointment pay/, "appointment_rate"], [/^Special pay/, "confirmation_rate"]]
      .find(([re]) => re.test(error.message))?.[1];
    // With what was chosen, so the form resets to it rather than to the old rates.
    return fail(error, field ? { [field]: error.message } : null, formValues(formData, Object.keys(schemas.projectRates)));
  }

  await logActivity(supabase, "project.rates", {
    entity: "project", entityId: projectId,
    detail: `lead ${data.lead_rate} · appointment ${data.appointment_rate} · special pay ${data.confirmation_rate}`,
  });
  revalidatePath("/reports/production");
  revalidatePath(`/projects/${projectId}`);
  return ok(data);
}
