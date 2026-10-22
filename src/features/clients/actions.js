"use server";

/** Clients (companies). */

import { revalidatePath } from "next/cache";
import { check, currentAppUser, deleteRow, fail, idFrom, logActivity, n, ok, s } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { cross, schemas } from "@/lib/validate";

export async function saveCompany(prevState, formData) {
  const { values, failed } = check(formData, schemas.company, cross.company);
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
    // Where it is on the clock, and when its work with us starts and ends.
    timezone_id: n(formData, "timezone_id"),
    subscription_start: s(formData, "subscription_start"),
    subscription_end: s(formData, "subscription_end"),
    // The carrier group it belongs to (an insurance company), or none.
    agency_group_id: n(formData, "agency_group_id"),
    // Who owns it (Sean, Oct 2026), and so all its projects.
    sales_rep_id: n(formData, "sales_rep_id"),
  };
  // A state as its two letters ("az" -> "AZ").
  if (payload.state) payload.state = payload.state.toUpperCase();
  const { data: saved, error } = id
    ? await supabase.from("companies").update(payload).eq("id", id).select("id").maybeSingle()
    : await supabase.from("companies").insert(payload).select("id").maybeSingle();
  if (error) return fail(error, null, values);

  // Who hears about it (Sean, Oct 2026): the people ticked, each by notification or by email too.
  if (saved?.id && formData.get("watchers_shown") === "1") {
    const watchers = formData.getAll("watch").map(Number).filter((v) => Number.isInteger(v) && v > 0)
      .map((userId) => ({ company_id: saved.id, user_id: userId, by_email: formData.get(`watch_by_${userId}`) === "email" }));
    const { error: clearError } = await supabase.from("client_watchers").delete().eq("company_id", saved.id);
    if (clearError) return fail(clearError, null, values);
    if (watchers.length) {
      const { error: watchError } = await supabase.from("client_watchers").insert(watchers);
      if (watchError) return fail(watchError, null, values);
    }
  }

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

/**
 * A client's branding (their logo and website): their own people set it from
 * Branding, an administrator any client's from its page (`companyId`). The
 * logo is a picture put in the public-images bucket under company/<id>/.
 */
async function brand(supabase, companyId, change) {
  const me = await currentAppUser(supabase);
  if (!me) return fail("You are signed out.");
  const { data: mine } = await supabase.from("users").select("company_id").eq("id", me.id).maybeSingle();
  const target = me.role === "admin" ? companyId ?? mine?.company_id : mine?.company_id;
  if (me.role !== "admin" && me.role !== "client") return fail("Only a client's own people, or an administrator, can change its branding.");
  if (!target) return fail("There is no client account to brand.");
  const { data: now, error: readError } = await supabase.from("companies").select("id, logo_path, website").eq("id", target).maybeSingle();
  if (readError) return fail(readError);
  if (!now) return fail("That client is not yours to change.");
  const next = { logo_path: now.logo_path, website: now.website, ...change };
  const { data, error } = await supabase.rpc("set_company_branding", { p_logo_path: next.logo_path, p_website: next.website, p_company_id: target });
  if (error) return fail(error);
  await logActivity(supabase, "company.branding", { entity: "company", entityId: target, detail: "logo_path" in change ? (change.logo_path ? "Logo" : "Logo removed") : "Website" });
  revalidatePath("/", "layout");
  return ok(data);
}

/** The logo: a path in the bucket, or null to take it away. */
export async function setCompanyLogo(path, companyId = null) {
  const supabase = await createClient();
  return brand(supabase, companyId ? Number(companyId) : null, { logo_path: path ? String(path) : null });
}

/** The website, from the Branding form. */
export async function saveCompanyWebsite(prevState, formData) {
  const { values, failed } = check(formData, schemas.branding);
  if (failed) return failed;
  const supabase = await createClient();
  const result = await brand(supabase, n(formData, "company_id"), { website: s(formData, "website") });
  return result.ok ? result : { ...result, fieldErrors: /website/i.test(result.error ?? "") ? { website: result.error } : null, values };
}

/** An administrator sets a client's logo from its page: bound to the client there. */
export async function setClientLogo(companyId, path) {
  const supabase = await createClient();
  return brand(supabase, Number(companyId), { logo_path: path ? String(path) : null });
}
