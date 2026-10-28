"use server";

/**
 * Renewing a lead project (Oct 2026): a client's program ends with names
 * still worth calling, and the renewal (ProjectB) carries on from ProjectA
 * without loading anything again. renew_project() in the database does the
 * work (supabase/migrations/…_project_renewal.sql); these say how many names
 * there are to carry and which, and what happened. Administrators.
 */

import { revalidatePath } from "next/cache";
import { currentAppUser, fail, logActivity, ok } from "@/lib/server/action-helpers";
import { paged } from "@/lib/server/query-helpers";
import { applyNameFilters } from "@/features/leads/queries";
import { carryInfoOnTie } from "@/features/project-info/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const idOf = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
// The most names one renewal carries by filter (a project's whole list goes with "all").
const MAX_PAGES = 50;

async function admin(supabase) {
  const me = await currentAppUser(supabase);
  return me?.role === "admin" ? me : null;
}

/** The viable call results of a lead project: Viable-No Contact, -Staged, -Left Message, -Email, Pending. */
async function viableResults(supabase) {
  const { data, error } = await supabase.from("call_results").select("id").eq("project_type", "DBDV").eq("viable", true);
  if (error) throw error;
  return (data ?? []).map((r) => r.id);
}

/** The viable names still on a project, narrowed by its list's search and filters when given. */
function viableQuery(supabase, projectId, viable, names, opts) {
  return applyNameFilters(supabase.from("leads").select("id", opts).eq("project_id", projectId).is("deleted_at", null)
    .eq("stage", "dbdev").in("result_id", viable).order("id"), names);
}

async function matchingIds(supabase, projectId, viable, { q = "", result = "", rep = "", ...names } = {}) {
  const ids = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error } = await paged(viableQuery(supabase, projectId, viable, names),
      { page, perPage: 1000, q: String(q ?? ""), filters: { result: idOf(result), rep: idOf(rep) } },
      { search: ["search_text"], columns: { result: "result_id", rep: "assigned_user_id" } });
    if (error) throw error;
    ids.push(...(data ?? []).map((r) => r.id));
    if ((data ?? []).length < 1000) break;
  }
  return ids;
}

const filtered = ({ q, result, rep, empMin, empMax, sic, state } = {}) => Boolean(q || result || rep || empMin || empMax || sic || state);

/** How many viable names a renewal could carry: all of them, and those matching the list's filters. */
export async function renewalNames(projectId, filters = {}) {
  const supabase = await createClient();
  if (!(await admin(supabase))) return fail("Only administrators renew projects.");
  const pid = idOf(projectId);
  try {
    const viable = await viableResults(supabase);
    const { count, error } = await viableQuery(supabase, pid, viable, {}, { count: "exact", head: true });
    if (error) throw error;
    const matching = filtered(filters) ? (await matchingIds(supabase, pid, viable, filters)).length : null;
    return ok({ all: count ?? 0, matching });
  } catch (e) {
    return fail(e);
  }
}

/**
 * ProjectB from ProjectA. `names`: "all" the viable names, "matching" those
 * matching the list's filters, or "none" (a new list to import). ProjectA is
 * marked Completed when `complete`.
 */
export async function renewProject(projectId, input = {}) {
  const supabase = await createClient();
  const me = await admin(supabase);
  if (!me) return fail("Only administrators renew projects.");
  const pid = idOf(projectId);
  const goal = (v) => (String(v ?? "").trim() === "" ? null : Number.parseInt(String(v).replace(/[,\s]/g, ""), 10));
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? v : null);
  const leadGoal = goal(input.leadGoal);
  const leadGoalMonth = goal(input.leadGoalMonth);
  if ([leadGoal, leadGoalMonth].some((g) => g !== null && !(Number.isInteger(g) && g >= 0 && g <= 1_000_000))) {
    return fail("A goal is a whole number of leads.");
  }
  const mode = ["all", "matching", "none"].includes(input.names) ? input.names : "all";
  let ids = [];
  try {
    if (mode === "matching") {
      ids = await matchingIds(supabase, pid, await viableResults(supabase), input.filters ?? {});
      if (!ids.length) return fail("No viable names match those filters.");
    }
  } catch (e) {
    return fail(e);
  }
  const { data, error } = await supabase.rpc("renew_project", {
    p_project: pid,
    p_name: String(input.name ?? "").trim(),
    p_lead_goal: leadGoal,
    p_lead_goal_month: leadGoalMonth,
    p_start: date(input.start),
    p_end: date(input.end),
    p_managers: [...new Set((Array.isArray(input.managers) ? input.managers : []).map(idOf).filter(Boolean))],
    p_names: mode === "matching" ? "picked" : mode,
    p_ids: ids,
    p_complete: input.complete !== false,
  });
  if (error) return fail(error.message);

  // ProjectB's Project Info is the appointment project's shared sheet, as ProjectA's was.
  const { data: b } = await supabase.from("projects").select("appt_project_id").eq("id", data.project_id).maybeSingle();
  if (b?.appt_project_id) await carryInfoOnTie(createAdminClient(), data.project_id, b.appt_project_id);

  await logActivity(supabase, "project.renew", {
    entity: "project", entityId: data.project_id,
    detail: `from project ${pid} · ${data.moved} names carried over${data.completed ? " · the old project completed" : ""}`, userId: me.id,
  });
  revalidatePath("/projects", "layout");
  revalidatePath("/work", "layout");
  revalidatePath("/clients", "layout");
  return ok(data);
}
