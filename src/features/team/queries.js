/** Meet the Team: the staff, with their photos. */

import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Every active member of staff: { id, name, role, photo, bio, mine } (mine: works the client's projects). */
export async function getTeam() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_directory");
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, name: r.name ?? "Team member", role: r.role, photo: r.photo_path, bio: r.bio, mine: Boolean(r.mine) }));
}
