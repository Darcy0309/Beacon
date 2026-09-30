/** The bulletin board. */

import "server-only";
import { colorFor, fullName, initialsOf, shortName, timeAgo } from "@/lib/format";
import { one } from "@/lib/server/query-helpers";
import { createClient } from "@/lib/supabase/server";

export async function getBulletin() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bulletin_board")
    .select("*, user:users(first_name, last_name, email), project:projects(id, name)")
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((b) => {
    const author = shortName(one(b.user)) || "Admin";
    return {
      id: b.id,
      author,
      initials: initialsOf(fullName(one(b.user)) || "Admin"),
      color: colorFor(author),
      time: timeAgo(b.created_at),
      text: b.message,
      project: one(b.project)?.name ?? null,
    };
  });
}
