/** The cargo list, for the Business tab's Cargo field and Settings. */

import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Every name on the cargo list, A to Z: [{ id, name }]. */
export async function getCargoTypes() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("cargo_types").select("id, name").order("name").limit(5000);
  if (error) throw error;
  return data ?? [];
}
