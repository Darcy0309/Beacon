"use server";

/** Clients (companies). */

import { revalidatePath } from "next/cache";
import { check, deleteRow, fail, idFrom, logActivity, ok, s } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { schemas } from "@/lib/validate";

export async function saveCompany(prevState, formData) {
  const { values, failed } = check(formData, schemas.company);
  if (failed) return failed;

  const supabase = await createClient();
  const id = idFrom(formData);
  const payload = {
    name: s(formData, "name"),
    contact_name: s(formData, "contact_name"),
    contact_title: s(formData, "contact_title"),
    email: s(formData, "email"),
    phone: s(formData, "phone"),
    address: s(formData, "address"),
    city: s(formData, "city"),
    state: s(formData, "state"),
    zip: s(formData, "zip"),
    website: s(formData, "website"),
    status: s(formData, "status") || "active",
  };
  // A state as its two letters ("az" -> "AZ").
  if (payload.state) payload.state = payload.state.toUpperCase();
  const { error } = id
    ? await supabase.from("companies").update(payload).eq("id", id)
    : await supabase.from("companies").insert(payload);
  if (error) return fail(error, null, values);

  await logActivity(supabase, id ? "company.update" : "company.create", { entity: "company", entityId: id ?? null, detail: payload.name });
  // New clients are offered on Projects and Users & Access too.
  revalidatePath("/clients", "layout");
  revalidatePath("/projects");
  revalidatePath("/users");
  return ok({ name: payload.name });
}

export async function deleteCompany(formData) {
  return deleteRow("companies", formData, ["/clients", "/projects", "/leads", "/appointments", "/calendar"], { action: "company.delete", entity: "company", name: "name" });
}
