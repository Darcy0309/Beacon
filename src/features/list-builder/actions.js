"use server";

/** The List Builder's saves: requests, where they stand, prospects' links, the SIC sheet, the radius. */

import { revalidatePath } from "next/cache";
import { currentAppUser, fail, logActivity, ok } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { unmappedZips, zipsAround } from "@/lib/server/zip-radius";
import { checkPlace, countyZipLists, placesOf, suggestPlaces, zipsOfCounties } from "@/lib/server/territory";
import { STATUSES, cleanCriteria, sicSheetRows } from "@/lib/list-builder";
import { parseCsv } from "@/lib/csv";

const idOf = (v) => (/^[1-9]\d{0,17}$/.test(String(v ?? "")) ? Number(v) : null);

/** The 6-digit codes, for the tree to open its industries into: [[code, name]]. Anyone with the form, a prospect's link too. */
export async function sicDetails() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sic_details");
  if (error) return fail(error);
  return ok(Array.isArray(data) ? data : []);
}

/** The ZIPs within a radius, to show as it is chosen: their count, nearest first. */
export async function radiusPreview(zip, miles) {
  const found = await zipsAround(zip, miles);
  if (!found) return fail(/^\d{5}$/.test(String(zip ?? "")) ? "This is not a real ZIP code" : "Enter a 5-digit ZIP code");
  return ok({ count: found.length, zips: found.slice(0, 400) });
}

/** A radius around a ZIP the Census doesn't have: what to say (it would bring in nothing). */
async function radiusProblem(criteria) {
  const r = criteria?.include?.radius;
  return r && !(await zipsAround(r.zip, r.miles)) ? `${r.zip} is not a real ZIP code` : null;
}

/** The ZIPs criteria bring in (the radius's and the counties') and those they take out (the counties left out). */
async function territoryZips(criteria) {
  const r = criteria?.include?.radius;
  const radius = r ? ((await zipsAround(r.zip, r.miles)) ?? []).map((z) => z.zip) : [];
  const states = criteria?.include?.states;
  const [inCounties, outCounties] = await Promise.all([zipsOfCounties(criteria?.include?.counties, states), zipsOfCounties(criteria?.exclude?.counties, states)]);
  return [[...radius, ...inCounties], outCounties];
}

/** Counties or cities to suggest as one is typed: from the states picked (or every state). */
export async function territorySuggest(kind, states, q) {
  if (!["counties", "cities"].includes(kind)) return [];
  return suggestPlaces(kind, (Array.isArray(states) ? states : []).filter((s) => /^[A-Z]{2}$/.test(s)), String(q ?? "").slice(0, 60));
}

/** Every county or city in the states picked, to choose from a list. */
export async function territoryList(kind, states) {
  if (!["counties", "cities"].includes(kind)) return [];
  return placesOf(kind, (Array.isArray(states) ? states : []).filter((s) => /^[A-Z]{2}$/.test(s)).slice(0, 60));
}

/**
 * What was just typed in a territory box, checked: counties and cities against
 * the Census's names (each { text, name } as kept, or { text, why }), ZIPs
 * against its map (those it doesn't have).
 */
export async function checkTerritory(kind, items, states = []) {
  const list = (Array.isArray(items) ? items : []).slice(0, 200).map(String);
  if (kind === "zips") return { unmapped: await unmappedZips(list) };
  if (!["counties", "cities"].includes(kind)) return { places: [] };
  const picked = (Array.isArray(states) ? states : []).filter((s) => /^[A-Z]{2}$/.test(s));
  return { places: await Promise.all(list.map(async (text) => ({ text, ...(await checkPlace(kind, text, picked)) }))) };
}

/** The ZIP codes in each county chosen, to leave some out. */
export async function countyZips(counties, states = []) {
  const picked = (Array.isArray(states) ? states : []).filter((s) => /^[A-Z]{2}$/.test(s));
  return countyZipLists((Array.isArray(counties) ? counties : []).slice(0, 50).map(String), picked);
}

/**
 * Keep a request (staff for any client or none; a client for their own):
 * `payload` is { id?, companyId, title, criteria, notes }. Returns its id.
 */
export async function saveListRequest(payload) {
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (!me) return fail("Sign in again to do that.");
  const criteria = cleanCriteria(payload?.criteria, ...(await territoryZips(payload?.criteria)));
  if (!criteria.sic.length) return fail("Pick at least one industry");
  const badRadius = await radiusProblem(criteria);
  if (badRadius) return fail(badRadius);
  const title = String(payload?.title ?? "").trim().slice(0, 160) || null;
  const notes = String(payload?.notes ?? "").trim().slice(0, 4000) || null;
  const client = me.role === "client";
  const row = { title, criteria, notes };
  if (!client) row.company_id = idOf(payload?.companyId);
  const id = idOf(payload?.id);
  let saved;
  if (id) {
    const { data, error } = await supabase.from("list_requests").update(row).eq("id", id).select("id").maybeSingle();
    if (error) return fail(error);
    if (!data) return fail("That request can no longer be changed here.");
    saved = data.id;
  } else {
    if (client) {
      const { data: mine } = await supabase.from("users").select("company_id").eq("id", me.id).maybeSingle();
      row.company_id = mine?.company_id ?? null;
      row.source = "client";
    } else row.source = "staff";
    const { data, error } = await supabase.from("list_requests").insert(row).select("id").single();
    if (error) return fail(/row-level security/i.test(error.message) ? "That client is not yours to ask for." : error);
    saved = data.id;
  }
  await logActivity(supabase, id ? "list_request.update" : "list_request.create", { entity: "list_request", entityId: saved, detail: title ?? `${criteria.sic.length} codes`, userId: me.id });
  revalidatePath("/list-builder");
  return ok({ id: saved });
}

/** Where a request stands (staff). */
export async function setListRequestStatus(id, status) {
  if (!STATUSES.some(([k]) => k === status)) return fail("Choose where it stands");
  const supabase = await createClient();
  const { data, error } = await supabase.from("list_requests").update({ status }).eq("id", idOf(id)).select("id").maybeSingle();
  if (error) return fail(error);
  if (!data) return fail("That request is not yours to change.");
  revalidatePath("/list-builder");
  revalidatePath(`/list-builder/${data.id}`);
  return ok({ id: data.id, status });
}

/** A link for prospects (staff): its label, its Sales Rep (the one making it unless chosen), its client if any, how long it is open. */
export async function createListLink({ label, salesRepId, companyId, days } = {}) {
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (!me || !["admin", "manager"].includes(me.role)) return fail("Only staff make these links.");
  const d = Math.min(365, Math.max(0, Math.round(Number(days) || 0)));
  const { data, error } = await supabase.from("list_request_links").insert({
    label: String(label ?? "").trim().slice(0, 120) || null,
    sales_rep_id: idOf(salesRepId) ?? me.id,
    company_id: idOf(companyId),
    expires_at: d ? new Date(Date.now() + d * 86400000).toISOString() : null,
    created_by: me.id,
  }).select("id, token").single();
  if (error) return fail(error);
  await logActivity(supabase, "list_link.create", { entity: "list_request_link", entityId: data.id, detail: label ?? null, userId: me.id });
  revalidatePath("/list-builder");
  return ok(data);
}

/** Turn a link off or on again. */
export async function setListLinkActive(id, active) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("list_request_links").update({ active: Boolean(active) }).eq("id", idOf(id)).select("id").maybeSingle();
  if (error) return fail(error);
  if (!data) return fail("That link is not yours to change.");
  revalidatePath("/list-builder");
  return ok({ id: data.id, active: Boolean(active) });
}

/**
 * An administrator loads the SIC sheet (Sean's, saved from Excel as CSV:
 * "SIC Code, SIC Description, Industry Class", sectors and groups among the
 * codes): the tree becomes the sheet, its names, order and classes; codes
 * not on it leave the tree.
 */
export async function loadSicSheet(formData) {
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (me?.role !== "admin") return fail("Only an administrator loads the codes.");
  const file = formData.get("file");
  if (!file || typeof file.text !== "function" || !file.size) return fail("Choose the sheet, saved as CSV");
  if (file.size > 2_000_000) return fail("That file is too big for a code sheet");
  const rows = sicSheetRows(parseCsv(await file.text()));
  if (!rows.length) return fail("No codes found: the sheet needs a code column, then its description");
  // Parents before children, so each one's parent is there when it is added.
  const rank = { sector: 0, group: 1, industry: 2, detail: 3 };
  rows.sort((a, b) => rank[a.kind] - rank[b.kind]);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("list_sic").upsert(rows.slice(i, i + 500), { onConflict: "code" });
    if (error) return fail(error);
  }
  // What is not on the sheet leaves the tree (its children with it).
  const keep = new Set(rows.map((r) => r.code));
  const { data: had, error: readError } = await supabase.from("list_sic").select("code").range(0, 9999);
  if (readError) return fail(readError);
  const gone = (had ?? []).map((r) => r.code).filter((c) => !keep.has(c));
  for (let i = 0; i < gone.length; i += 200) {
    const { error } = await supabase.from("list_sic").delete().in("code", gone.slice(i, i + 200));
    if (error) return fail(error);
  }
  await logActivity(supabase, "list_sic.load", { detail: `${rows.length} codes`, userId: me.id });
  revalidatePath("/list-builder");
  return ok({ count: rows.length });
}

/** A prospect sends their request through a link (no sign-in). */
export async function submitProspectRequest({ token, prospect, criteria, notes }) {
  const clean = cleanCriteria(criteria, ...(await territoryZips(criteria)));
  if (!clean.sic.length) return fail("Pick at least one industry");
  const badRadius = await radiusProblem(clean);
  if (badRadius) return fail(badRadius);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_list_request", {
    p_token: String(token ?? ""), p_prospect: prospect ?? {}, p_criteria: clean, p_notes: String(notes ?? "").slice(0, 4000),
  });
  if (error) return fail(error.message);
  return ok({ id: data });
}
