/** Projects: each client's campaigns. */

import "server-only";
import { colorFor, shortDate, shortName } from "@/lib/format";
import { inner, one, paged, runPaged } from "@/lib/server/query-helpers";
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

/** One page of projects, searched and filtered in the database. */
export async function listProjects(params) {
  const supabase = await createClient();
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
        { search: ["name", "client_name"], columns: { status: "status.name", type: "type.code", client: "company.name" } }
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
