/** Workspace settings. */

import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getSettings() {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("*");
  const map = {};
  for (const row of data ?? []) map[row.key] = row.value;
  return { settings: map };
}
