/** The document library. */

import "server-only";
import { fileSize, shortDate } from "@/lib/format";
import { inner, one, paged, runPaged } from "@/lib/server/query-helpers";
import { createClient } from "@/lib/supabase/server";

/**
 * One page of documents, plus the type and client of every document for the
 * tiles and facet options.
 */
export async function listDocuments(params) {
  const supabase = await createClient();
  const [{ rows, total }, { data: all }] = await Promise.all([
    runPaged(
      (p) =>
        paged(
          supabase
            .from("documents")
            .select(`*, company:companies${inner(Boolean(p.filters?.client))}(name), project:projects(name)`, { count: "exact" })
            .order("created_at", { ascending: false })
            .order("id", { ascending: false }),
          p,
          { search: ["name"], columns: { type: "file_type", client: "company.name" } }
        ),
      params
    ),
    supabase.from("documents").select("file_type, company:companies(name)"),
  ]);

  const stats = (all ?? []).map((d) => ({ type: d.file_type ?? "—", client: one(d.company)?.name ?? "—" }));
  const distinct = (key) => [...new Set(stats.map((d) => d[key]).filter((v) => v && v !== "—"))].sort();

  return {
    rows: rows.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.file_type ?? "—",
      client: one(d.company)?.name ?? "—",
      size: fileSize(d.size_bytes),
      date: shortDate(d.created_at),
    })),
    total,
    stats,
    types: distinct("type"),
    clients: distinct("client"),
  };
}
