"use server";

/**
 * Giving a lead to another client, and moving names between projects (Sean,
 * Oct 2026): transfer_lead() and move_names() in the database do the work
 * (supabase/migrations/…_transfer_names.sql); these find where a lead could
 * go (the same business on another client's list; clients whose office is
 * within a radius) and say what happened. Administrators and account
 * managers.
 */

import { revalidatePath } from "next/cache";
import { currentAppUser, fail, logActivity, ok } from "@/lib/server/action-helpers";
import { paged } from "@/lib/server/query-helpers";
import { applyNameFilters } from "@/features/leads/queries";
import { createClient } from "@/lib/supabase/server";
import { zipPoint } from "@/lib/server/zip-radius";
import { cityPoint } from "@/lib/server/territory";
import { milesBetween } from "@/lib/list-builder";

const idOf = (v) => (/^[1-9]\d{0,17}$/.test(String(v ?? "")) ? Number(v) : null);
const MAX_MILES = 500;

async function manager(supabase) {
  const me = await currentAppUser(supabase);
  return me && ["admin", "manager"].includes(me.role) ? me : null;
}

/**
 * Where a place is: a 5-digit ZIP, or a city ("Mesa, AZ", or "Mesa" in the
 * lead's state). { point, label } or { error }.
 */
async function placeOf(text, state) {
  const t = String(text ?? "").trim();
  if (/^\d{5}$/.test(t)) {
    const point = await zipPoint(t);
    return point ? { point, label: t } : { error: `${t} is not a real ZIP code` };
  }
  const m = /^(.+?)(?:,\s*([A-Za-z]{2}))?$/.exec(t);
  const st = (m?.[2] ?? state ?? "").toUpperCase();
  if (!m || !st) return { error: "Type a ZIP code, or a city and its state (Mesa, AZ)" };
  const point = await cityPoint(m[1], st);
  return point ? { point, label: `${m[1].trim()}, ${st}` } : { error: `${m[1].trim()}, ${st} is not on the Census list of places` };
}

/**
 * What a transfer offers for a lead: the same business on other clients'
 * active lists, and every active appointment project, with how far its
 * client's office is from `from` (the lead's ZIP unless another ZIP or city
 * is typed); those within `miles` nearest first.
 */
export async function transferChoices(leadId, { from = "", miles = 50 } = {}) {
  const supabase = await createClient();
  if (!(await manager(supabase))) return fail("Only administrators and account managers transfer leads.");
  const id = idOf(leadId);
  const { data: lead, error } = await supabase.from("leads").select("id, project_id, zip, city, state").eq("id", id).maybeSingle();
  if (error) return fail(error);
  if (!lead) return fail("That lead no longer exists.");
  const [{ data: matches, error: e1 }, { data: projects, error: e2 }] = await Promise.all([
    supabase.rpc("transfer_matches", { p_lead: id }),
    supabase.rpc("transfer_projects", { p_type: "APPT" }),
  ]);
  if (e1 || e2) return fail(e1 ?? e2);

  const radius = Math.min(MAX_MILES, Math.max(1, Number(miles) || 50));
  const typed = String(from ?? "").trim();
  const origin = typed ? await placeOf(typed, lead.state) : lead.zip ? await placeOf(String(lead.zip).slice(0, 5), lead.state) : lead.city ? await placeOf(lead.city, lead.state) : null;
  const others = (projects ?? []).filter((p) => p.id !== lead.project_id);
  const withMiles = await Promise.all(others.map(async (p) => {
    const office = (p.zip && (await zipPoint(p.zip))) || (p.city && p.state ? await cityPoint(p.city, p.state) : null);
    return { ...p, miles: origin?.point && office ? Math.round(milesBetween(origin.point, office)) : null, hasOffice: Boolean(office) };
  }));
  return ok({
    matches: matches ?? [],
    from: origin?.label ?? null,
    fromError: origin?.error ?? (origin ? null : "This lead has no ZIP or city: type one to measure from"),
    miles: radius,
    nearby: withMiles.filter((p) => p.miles != null && p.miles <= radius).sort((a, b) => a.miles - b.miles),
    projects: withMiles,
  });
}

/** Give a lead to another client's project (`into`: the same business already on that list). The record it is now on. */
export async function transferLead(leadId, projectId, intoId = null) {
  const supabase = await createClient();
  const me = await manager(supabase);
  if (!me) return fail("Only administrators and account managers transfer leads.");
  const { data, error } = await supabase.rpc("transfer_lead", { p_lead: idOf(leadId), p_project: idOf(projectId), p_into: idOf(intoId) });
  if (error) return fail(error.message);
  await logActivity(supabase, "lead.transfer", { entity: "lead", entityId: data.id, detail: `from lead ${leadId}`, userId: me.id });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath(`/leads/${data.id}`);
  return ok(data);
}

/** Every active project of a kind, to move names to: [{ id, name, client }]. */
export async function moveTargets(type) {
  const supabase = await createClient();
  if (!(await manager(supabase))) return fail("Only administrators and account managers move names.");
  const { data, error } = await supabase.rpc("transfer_projects", { p_type: type === "DBDV" ? "DBDV" : "APPT" });
  if (error) return fail(error);
  return ok((data ?? []).map((p) => ({ id: p.id, name: p.name, client: p.client })));
}

/**
 * The ids of every name on a project matching its list's search and
 * filters (call result, assigned rep, employees, SIC, state), up to 5,000:
 * "all that match", for a move or a change of call result.
 */
export async function matchingNames(projectId, { q = "", result = "", rep = "", ...names } = {}) {
  const supabase = await createClient();
  if (!(await manager(supabase))) return fail("Only administrators and account managers move names.");
  const ids = [];
  for (let page = 1; page <= 5; page += 1) {
    const query = applyNameFilters(supabase.from("leads").select("id").eq("project_id", idOf(projectId)).is("deleted_at", null).order("id"), names);
    const { data, error } = await paged(query, { page, perPage: 1000, q: String(q ?? ""), filters: { result: idOf(result), rep: idOf(rep) } },
      { search: ["search_text"], columns: { result: "result_id", rep: "assigned_user_id" } });
    if (error) return fail(error);
    ids.push(...(data ?? []).map((r) => r.id));
    if ((data ?? []).length < 1000) break;
  }
  return ok({ ids });
}

/** Move names to another project of the same kind, with a call result there. */
export async function moveNames(ids, projectId, resultId) {
  const supabase = await createClient();
  const me = await manager(supabase);
  if (!me) return fail("Only administrators and account managers move names.");
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(idOf).filter(Boolean))];
  if (!list.length) return fail("Choose the names to move.");
  const { data, error } = await supabase.rpc("move_names", { p_ids: list, p_project: idOf(projectId), p_result: idOf(resultId) });
  if (error) return fail(error.message);
  await logActivity(supabase, "lead.move", { entity: "project", entityId: data.project_id, detail: `${data.moved} moved, ${data.skipped} already there`, userId: me.id });
  revalidatePath("/projects");
  return ok(data);
}

/**
 * Change many names' call results at once (Sean, Oct 2026: the old Result
 * Change): Removed back to Viable, or Removed for those a client no longer
 * wants. No call is recorded and no pay.
 */
export async function changeResults(ids, resultId) {
  const supabase = await createClient();
  const me = await manager(supabase);
  if (!me) return fail("Only administrators and account managers change call results.");
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(idOf).filter(Boolean))];
  if (!list.length) return fail("Choose the names to change.");
  const { data, error } = await supabase.rpc("change_results", { p_ids: list, p_result: idOf(resultId) });
  if (error) return fail(error.message);
  await logActivity(supabase, "lead.results", { detail: `${data.changed} changed to ${data.result}`, userId: me.id });
  revalidatePath("/projects");
  return ok(data);
}
