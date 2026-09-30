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
            .select(`*, project:projects${inner(Boolean(p.filters?.project))}(name)`, { count: "exact" })
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
    })),
    total,
    stats,
    projects: [...new Set(stats.map((i) => i.project).filter((v) => v !== "—"))].sort(),
  };
}
