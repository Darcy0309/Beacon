/** The document library. */

import "server-only";
import { fileSize, shortDate } from "@/lib/format";
import { one, paged, runPaged } from "@/lib/server/query-helpers";
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
            .select(`*, company:companies(name), project:projects(name, contact_name),
              lead:leads!documents_lead_id_fkey(id, company_name, producer_name)`, { count: "exact" })
            .order("created_at", { ascending: false })
            .order("id", { ascending: false }),
          p,
          // Client and project by the names the file keeps (Nov 2026): a deleted list's files still found by them.
          { search: ["name", "business_name", "project_name", "client_name"], columns: { type: "file_type", client: "client_name", project: "project_name" } }
        ),
      params
    ),
    supabase.from("documents").select("file_type, client_name, project_name, company:companies(name)"),
  ]);

  const stats = (all ?? []).map((d) => ({ type: d.file_type ?? "—", client: one(d.company)?.name ?? d.client_name ?? "—", project: d.project_name ?? "—" }));
  const distinct = (key) => [...new Set(stats.map((d) => d[key]).filter((v) => v && v !== "—"))].sort();

  return {
    rows: rows.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.file_type ?? "—",
      client: one(d.company)?.name ?? d.client_name ?? "—",
      // What it is attached to (Sean, Oct 2026): the business (its lead), the project and the project's agent
      // (the lead's own producer when an import gave one, else the project's, as the lead sheet says). As they
      // are now while they are there; the names the file kept once they are gone (a list deleted, Nov 2026).
      leadId: one(d.lead)?.id ?? null,
      business: one(d.lead)?.company_name ?? d.business_name ?? null,
      project: one(d.project)?.name ?? d.project_name ?? null,
      agent: one(d.lead)?.producer_name || one(d.project)?.contact_name || d.agent_name || null,
      size: fileSize(d.size_bytes),
      date: shortDate(d.created_at),
      // A file kept with a lead (its Policy Files) opens; an older record has no file to open.
      href: d.storage_path?.startsWith("lead/") ? `/api/files/${d.id}` : null,
    })),
    total,
    stats,
    types: distinct("type"),
    clients: distinct("client"),
    projects: distinct("project"),
  };
}
