/** Projects: each client's campaigns. */

import "server-only";
import { colorFor, fullName, shortDate, shortName, timeAgo } from "@/lib/format";
import { inner, one, paged, runPaged, searchWords } from "@/lib/server/query-helpers";
import { createClient } from "@/lib/supabase/server";

const projectSelect = ({ company = false, type = false, status = false } = {}) => `
  *,
  company:companies${inner(company)}(id, name),
  type:project_types${inner(type)}(id, code, description),
  status:project_statuses${inner(status)}(id, name),
  assignments:project_assignments(ae:users!project_assignments_ae_user_id_fkey(id, first_name, last_name, email)),
  leads!leads_project_id_fkey(count)
`;

const PROJECT_SELECT = projectSelect();

function toProjectView(p) {
  const company = one(p.company);
  return {
    id: p.id,
    name: p.name,
    client: company?.name ?? p.client_name ?? "—",
    clientId: company?.id ?? null,
    type: one(p.type)?.code ?? "—",
    leads: p.leads?.[0]?.count ?? 0,
    status: one(p.status)?.name ?? "—",
    manager: shortName(one((p.assignments ?? [])[0]?.ae)),
    color: colorFor(p.name),
    description: p.description,
    startDate: shortDate(p.start_date),
    endDate: shortDate(p.end_date),
    amount: p.amount_paid,
    raw: p,
  };
}

export async function getProjects() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").select(PROJECT_SELECT).order("id");
  if (error) throw error;
  return (data ?? []).map(toProjectView);
}

/**
 * One page of projects, searched and filtered in the database. A search
 * word matches the project's name or its client's: the client is a linked
 * company (client_name is only the old free-text field, empty on projects
 * saved through the app).
 */
export async function listProjects(params) {
  const supabase = await createClient();
  const words = searchWords(params.q);
  const clientIds = await Promise.all(
    words.map(async (w) => {
      const { data } = await supabase.from("companies").select("id").ilike("name", `%${w}%`).limit(500);
      return (data ?? []).map((c) => c.id);
    })
  );
  const alsoOr = (_word, i) => (clientIds[i]?.length ? [`company_id.in.(${clientIds[i].join(",")})`] : []);
  const { rows, total } = await runPaged(
    (p) =>
      paged(
        supabase
          .from("projects")
          .select(
            projectSelect({ company: Boolean(p.filters?.client), type: Boolean(p.filters?.type), status: Boolean(p.filters?.status) }),
            { count: "exact" }
          )
          .order("id"),
        p,
        { search: ["name", "client_name"], alsoOr, columns: { status: "status.name", type: "type.code", client: "company.name" } }
      ),
    params
  );
  return { rows: rows.map(toProjectView), total };
}

/** Whole-table figures for the projects page tiles: a few columns per row, no embeds to speak of. */
export async function getProjectStats() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("amount_paid, type:project_types(code), status:project_statuses(name), leads!leads_project_id_fkey(count)");
  if (error) throw error;
  return (data ?? []).map((p) => ({
    type: one(p.type)?.code ?? "—",
    status: one(p.status)?.name ?? "—",
    leads: p.leads?.[0]?.count ?? 0,
    amount: Number(p.amount_paid ?? 0),
  }));
}

export async function getProject(id) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").select(PROJECT_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toProjectView(data) : null;
}

/** One project's true totals (project_overview()): every lead, appointment and call on it, not a page of them. */
export async function getProjectOverview(id) {
  const supabase = await createClient();
  const { data: o, error } = await supabase.rpc("project_overview", { p_project_id: Number(id) });
  if (error) throw error;
  const n = (key) => Number(o?.[key] ?? 0);
  return {
    leads: n("leads"),
    viableLeft: n("viable_left"),
    unassigned: n("unassigned"),
    pending: n("pending"),
    offList: n("off_list"),
    appointments: n("appointments"),
    apptsMonth: n("appts_month"),
    qaPending: n("qa_pending"),
    callsToday: n("calls_today"),
    callsMonth: n("calls_month"),
    lastWorked: o?.last_worked ? timeAgo(o.last_worked) : "Never",
    // Calls a day for the last two weeks, oldest first.
    calls14d: (o?.calls_14d ?? []).map(Number),
  };
}

/** Who works a project, with what each has left and has done (project_reps()). */
export async function getProjectTeam(id) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("project_reps", { p_project_id: Number(id) });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.user_id,
    name: fullName(r),
    short: shortName(r),
    role: r.role,
    active: r.status === "active",
    namesLeft: Number(r.names_left),
    leadsHeld: Number(r.leads_held),
    callsToday: Number(r.calls_today),
    callsMonth: Number(r.calls_month),
    apptsMonth: Number(r.appts_month),
    lastWorked: r.last_worked ? timeAgo(r.last_worked) : "Never",
  }));
}

/** Every project's pay rates, for an administrator setting them. */
export async function getProjectRates() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, lead_rate, appointment_rate, confirmation_rate, type:project_types(code), company:companies(name)")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    client: one(p.company)?.name ?? "—",
    type: one(p.type)?.code ?? "—",
    lead: Number(p.lead_rate ?? 0),
    appointment: Number(p.appointment_rate ?? 0),
    confirmation: Number(p.confirmation_rate ?? 0),
  }));
}
