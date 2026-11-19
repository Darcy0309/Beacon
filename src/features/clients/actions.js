"use server";

/** Clients (companies). */

import { revalidatePath } from "next/cache";
import { check, currentAppUser, deleteRow, fail, idFrom, logActivity, n, ok, s } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { cross, schemas } from "@/lib/validate";

/**
 * Signature Select from the client form (Sean, Nov 2026), checked before anything is saved: null when the form
 * has none to save, { failed } when it is wrong, else { mode, termId, row }.
 */
function readSelect(formData, values) {
  const mode = String(formData.get("select_mode") ?? "");
  if (mode !== "edit" && mode !== "new") return null;
  const plan = String(formData.get("select_plan") ?? "");
  const amount = Number(String(formData.get("select_amount") ?? "").replace(/[$,\s]/g, ""));
  const starts = String(formData.get("select_starts") ?? "");
  const ends = String(formData.get("select_ends") ?? "");
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const errors = {};
  if (!["monthly", "annual"].includes(plan)) {
    if (mode === "new" && !plan) return null; // not on Signature Select
    errors.select_plan = "Choose Monthly or Annual";
  }
  if (!(amount > 0 && amount < 1_000_000)) errors.select_amount = "Enter the amount";
  if (!iso.test(starts)) errors.select_starts = "Choose when it starts";
  if (ends && !iso.test(ends)) errors.select_ends = "Choose a day";
  else if (plan === "annual" && !ends) errors.select_ends = "An annual term needs its end";
  else if (ends && iso.test(starts) && ends < starts) errors.select_ends = "It ends after it starts";
  const echo = { ...values, select_plan: plan, select_amount: formData.get("select_amount"), select_starts: starts, select_ends: ends };
  if (Object.keys(errors).length) return { failed: fail(Object.values(errors)[0], errors, echo) };
  const termId = /^[1-9]\d{0,17}$/.test(String(formData.get("select_term_id") ?? "")) ? Number(formData.get("select_term_id")) : null;
  return { mode: mode === "edit" && termId ? "edit" : "new", termId, row: { plan, amount: Math.round(amount * 100) / 100, starts_on: starts, ends_on: ends || null } };
}

/** A client's Signature Select term saved: changed, or a new one (a monthly one still running ends the day before). */
async function saveSelect(supabase, companyId, select, userId) {
  if (select.mode === "edit") {
    const { data, error } = await supabase.from("select_terms").update({ ...select.row, updated_at: new Date().toISOString(), reminded_at: null })
      .eq("id", select.termId).eq("company_id", companyId).select("id");
    if (error) return error.message;
    return data?.length ? null : "Only an administrator or the client's Sales Rep can change Signature Select.";
  }
  const before = new Date(`${select.row.starts_on}T00:00:00Z`);
  before.setUTCDate(before.getUTCDate() - 1);
  const { error: closeError } = await supabase.from("select_terms").update({ ends_on: before.toISOString().slice(0, 10), updated_at: new Date().toISOString() })
    .eq("company_id", companyId).eq("plan", "monthly").is("ends_on", null).lt("starts_on", select.row.starts_on);
  if (closeError) return closeError.message;
  const { error } = await supabase.from("select_terms").insert({ company_id: companyId, ...select.row, created_by: userId ?? null });
  if (error) return /row-level security|permission/i.test(error.message) ? "Only an administrator or the client's Sales Rep can change Signature Select." : error.message;
  return null;
}

export async function saveCompany(prevState, formData) {
  const { values, failed } = check(formData, schemas.company, cross.company);
  if (failed) return failed;
  const select = readSelect(formData, values);
  if (select?.failed) return select.failed;

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
    // When they started with us ("Client since"); their Signature Select terms keep when access ends (Nov 2026).
    subscription_start: s(formData, "subscription_start"),
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
  // Row Level Security answers an update it refuses with no row, not an error (Oct 2026: said, not "Client updated").
  if (id && !saved) return fail("Nothing was saved: that client may have been deleted, or isn't yours to change.", null, values);

  // Signature Select (Nov 2026).
  if (select && saved?.id) {
    const me = await currentAppUser(supabase);
    const problem = await saveSelect(supabase, saved.id, select, me?.id);
    if (problem) return fail(`The client was saved, but not its Signature Select: ${problem}`, null, values);
    revalidatePath("/reports/select");
  }

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

/** Delete a client, with its projects, their names and its people's logins (all restorable): administrators only. */
export async function deleteCompany(formData) {
  const me = await currentAppUser(await createClient());
  if (me?.role !== "admin") return fail("Only an administrator can delete a client.");
  return deleteRow("companies", formData, ["/clients", "/projects", "/leads", "/appointments", "/calendar", "/users"], { action: "company.delete", entity: "company", name: "name" });
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

/**
 * Signature Select on its own (Sean, Nov 2026: "it's the sales rep job to go into their client and turn off
 * access"): a client's term changed or a new one, from Payments Due, where a Sales Rep who is a manager has
 * their clients (the client's page is the administrators'). The database keeps it to an administrator and
 * the client's Sales Rep.
 */
export async function saveSelectTerm(prevState, formData) {
  const companyId = idFrom(formData, "company_id");
  if (!companyId) return fail("Choose the client");
  const select = readSelect(formData, {});
  if (!select) return fail("Choose Monthly or Annual", { select_plan: "Choose Monthly or Annual" });
  if (select.failed) return select.failed;
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  const problem = await saveSelect(supabase, companyId, select, me?.id);
  if (problem) return fail(problem);
  revalidatePath("/payments");
  revalidatePath("/clients", "layout");
  revalidatePath("/reports/select");
  return ok({ id: companyId });
}
