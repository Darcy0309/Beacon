/** What has been deleted and can be restored (administrators). */

import "server-only";
import { createClient } from "@/lib/supabase/server";

/** What each kind of record is called. */
export const KIND_LABEL = {
  companies: "Client", projects: "Project", leads: "Lead", appointments: "Appointment",
  agencies: "Insurance company", documents: "Document", bulletin_board: "Bulletin post", users: "User",
};

/**
 * The records deleted in their own right, newest first (deleted_records()):
 * { kind, id, label, name, detail, deletedAt, deletedBy, also } where `also`
 * counts what went with it (a project's leads, their appointments). Empty
 * for anyone but an administrator.
 */
export async function getDeletedRecords() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("deleted_records");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    kind: r.kind, id: Number(r.id), label: KIND_LABEL[r.kind] ?? r.kind, name: r.name || "(no name)", detail: r.detail,
    deletedAt: r.deleted_at, deletedBy: r.deleted_by, also: Number(r.also ?? 0),
  }));
}
