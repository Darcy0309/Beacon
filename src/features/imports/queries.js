/** CSV import history. */

import "server-only";
import { dateTime } from "@/lib/format";
import { inner, one, paged, runPaged } from "@/lib/server/query-helpers";
import { createClient } from "@/lib/supabase/server";

const IMPORT_LABEL = { completed: "Complete", processing: "Processing", pending: "Processing", failed: "Failed" };

export const IMPORT_STATUS_OPTIONS = [
  { value: "completed", label: "Complete" },
  { value: "processing", label: "Processing" },
  { value: "failed", label: "Failed" },
];

/**
 * One page of import batches, plus the row totals of every batch for the
 * tiles and the projects that have been imported into, for the facet.
 */
export async function listImports(params) {
  const supabase = await createClient();
  const [{ rows, total }, { data: all }] = await Promise.all([
    runPaged(
      (p) =>
        paged(
          supabase
            .from("import_batches")
            .select(`*, project:projects${inner(Boolean(p.filters?.project))}(id, name)`, { count: "exact" })
            .order("created_at", { ascending: false })
            .order("id", { ascending: false }),
          p,
          { search: ["file_name"], columns: { status: "status", project: "project.name" } }
        ),
      params
    ),
    supabase.from("import_batches").select("row_count, imported_count, error_count, project:projects(name)").order("created_at", { ascending: false }),
  ]);

  const stats = (all ?? []).map((i) => ({
    rows: i.row_count ?? 0,
    imported: i.imported_count ?? 0,
    errors: i.error_count ?? 0,
    project: one(i.project)?.name ?? "—",
  }));

  return {
    rows: rows.map((i) => ({
      id: i.id,
      file: i.file_name,
      rows: i.row_count ?? 0,
      imported: i.imported_count ?? 0,
      errors: i.error_count ?? 0,
      status: IMPORT_LABEL[i.status] ?? i.status,
      date: dateTime(i.created_at),
      project: one(i.project)?.name ?? "—",
      projectId: one(i.project)?.id ?? null,
    })),
    total,
    stats,
    projects: [...new Set(stats.map((i) => i.project).filter((v) => v !== "—"))].sort(),
  };
}

/**
 * Every client's projects, for an import to check a new list against other
 * clients' (Oct 2026: clients of one Agency Group, such as Rural Insurance
 * or Erie, in one territory): each with its client, the client's Agency
 * Group, its state (the project's office, else the client's), kind and status.
 */
export async function getCheckProjects() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects")
    .select("id, name, state, company_id, company:companies(name, state, group:agencies(id, name)), type:project_types(code), status:project_statuses(name)")
    .is("deleted_at", null).order("name");
  if (error) throw error;
  return (data ?? []).map((p) => {
    const company = one(p.company);
    const group = one(company?.group);
    return {
      id: p.id,
      name: p.name,
      clientId: p.company_id,
      client: company?.name ?? "—",
      groupId: group?.id ?? null,
      group: group?.name ?? null,
      state: (p.state || company?.state || "").toUpperCase() || null,
      type: one(p.type)?.code ?? null,
      status: one(p.status)?.name ?? null,
    };
  });
}
