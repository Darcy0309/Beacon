"use server";

/** Projects. */

import { revalidatePath } from "next/cache";
import { check, deleteRow, fail, idFrom, logActivity, n, ok, onlySubmitted, s } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { cross, schemas } from "@/lib/validate";

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
    description: s(formData, "description"),
    client_name: s(formData, "client_name"),
    start_date: s(formData, "start_date"),
    end_date: s(formData, "end_date"),
    amount_paid: n(formData, "amount_paid"),
  };
  const { error } = id
    ? await supabase.from("projects").update(onlySubmitted(formData, payload)).eq("id", id)
    : await supabase.from("projects").insert(payload);
  if (error) return fail(error);

  await logActivity(supabase, id ? "project.update" : "project.create", { entity: "project", entityId: id ?? null });
  revalidatePath("/projects");
  return ok();
}

export async function deleteProject(formData) {
  return deleteRow("projects", formData, ["/projects", "/clients"]);
}
