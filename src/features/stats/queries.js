/** Client and project figures counted by call result, and the days a project's calendar has appointments. */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { shapeStats } from "@/lib/lead-stats";

/**
 * A client's figures: `total` (each name once) and `byProject` (by project
 * id); or with `projectId`, that project's alone as `total`.
 */
export async function getLeadStats({ companyId = null, projectId = null }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lead_stats", { p_company_id: companyId, p_project_id: projectId });
  if (error) throw error;
  const rows = data ?? [];
  const byProject = Object.fromEntries(rows.filter((r) => r.project_id != null).map((r) => [r.project_id, shapeStats(r)]));
  const total = projectId ? byProject[projectId] ?? shapeStats(null) : shapeStats(rows.find((r) => r.project_id == null));
  return { total, byProject };
}

/** A project's names by call result, most first: [{ result, names, kind, share }]. */
export async function getResultBreakdown(projectId) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("result_breakdown", { p_project_id: Number(projectId) });
  if (error) throw error;
  const rows = (data ?? []).map((r) => ({ result: r.result, names: Number(r.names), kind: r.kind }));
  const all = rows.reduce((sum, r) => sum + r.names, 0);
  return rows.map((r) => ({ ...r, share: all ? (r.names / all) * 100 : 0 }));
}

/**
 * The projects whose appointments make up a calendar: a client's (all of
 * its projects), or a project's own. A DB dev project's appointments are
 * kept on the appointment project it promotes to, so the two share one.
 * Returns { ids, label } or null when there is no such client or project.
 */
export async function getCalendarScope({ clientId = null, projectId = null }) {
  const supabase = await createClient();
  if (projectId) {
    const { data: p } = await supabase.from("projects").select("id, name, appt_project_id").eq("id", projectId).maybeSingle();
    if (!p) return null;
    const { data: appt } = p.appt_project_id
      ? await supabase.from("projects").select("id, name").eq("id", p.appt_project_id).maybeSingle()
      : { data: null };
    return { ids: [appt?.id ?? p.id], label: appt?.name ?? p.name, shared: appt ? p.name : null };
  }
  if (clientId) {
    const [{ data: c }, { data: ps }] = await Promise.all([
      supabase.from("companies").select("id, name").eq("id", clientId).maybeSingle(),
      supabase.from("projects").select("id").eq("company_id", clientId),
    ]);
    if (!c) return null;
    return { ids: (ps ?? []).map((p) => p.id), label: `${c.name}: all projects`, shared: null };
  }
  return null;
}

/** How many appointments (not invalid) each day from `from` to `to` has on these projects: { "2026-10-14": 2 }. */
export async function getAppointmentDays({ projectIds, from, to }) {
  if (!projectIds?.length) return {};
  const supabase = await createClient();
  const { data, error } = await supabase.from("appointments").select("appt_date")
    .in("project_id", projectIds).is("invalid_at", null).gte("appt_date", from).lte("appt_date", to).limit(5000);
  if (error) throw error;
  const days = {};
  for (const a of data ?? []) days[a.appt_date] = (days[a.appt_date] ?? 0) + 1;
  return days;
}
