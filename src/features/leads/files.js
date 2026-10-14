/** Policy files kept with a lead (documents with a lead_id, in the lead-files bucket). */

import "server-only";
import { fileSize, fullName } from "@/lib/format";

export const FILES_BUCKET = "lead-files";

/** A lead's files, newest first, as the Policy Files tab lists them. `supabase`: the caller's own (or the server's). */
export async function listLeadFiles(supabase, leadId) {
  const { data, error } = await supabase.from("documents")
    .select("id, name, file_type, size_bytes, created_at, storage_path, by:users!documents_uploaded_by_fkey(first_name, last_name, email, role)")
    .eq("lead_id", Number(leadId)).is("deleted_at", null)
    .order("created_at", { ascending: false }).order("id", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => {
    const by = Array.isArray(d.by) ? d.by[0] : d.by;
    return {
      id: d.id, name: d.name, type: d.file_type, size: d.size_bytes != null ? fileSize(d.size_bytes) : null,
      at: d.created_at, by: by ? fullName(by) || by.email : null, byClient: by?.role === "client",
    };
  });
}
