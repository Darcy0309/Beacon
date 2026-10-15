/** Project Info, read as the signed-in person: Row Level Security decides whose. */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { loadProjectInfo } from "./server";

/** A project's Project Info (the appointment project's, for a DB dev project that promotes to one); null when not theirs to see. */
export async function getProjectInfo(projectId) {
  if (!projectId) return null;
  return loadProjectInfo(await createClient(), projectId);
}

/**
 * Every Project Info a client's person can see and change, one for each of
 * their projects (a DB dev project's is its appointment project's, listed
 * once), by project name.
 */
export async function getClientProjectInfos() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").select("id, appt_project_id").is("deleted_at", null);
  if (error) throw error;
  const ids = [...new Set((data ?? []).map((p) => p.appt_project_id ?? p.id))];
  const infos = (await Promise.all(ids.map((id) => loadProjectInfo(supabase, id)))).filter(Boolean);
  const seen = new Set();
  return infos
    .filter((i) => !seen.has(i.project_id) && seen.add(i.project_id))
    .sort((a, b) => a.project_name.localeCompare(b.project_name));
}
