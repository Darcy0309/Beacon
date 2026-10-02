/** The business's day: its time zone, and what date it is there now. */

import "server-only";
import { cache } from "react";
import { todayIn } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

/**
 * The business's time zone (business_tz(): the business_timezone setting,
 * America/Phoenix until set). "Today", "this week" and each day of the
 * reports follow it. Read once per request.
 */
export const getBusinessTimeZone = cache(async function getBusinessTimeZone() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("business_tz");
  return data || "America/Phoenix";
});

/**
 * Today's date ("YYYY-MM-DD") where the business is. The server's own clock
 * runs on UTC, where a US evening is already tomorrow.
 */
export async function getBusinessToday() {
  try {
    return todayIn(await getBusinessTimeZone());
  } catch {
    // A zone name the database knows but this runtime does not: Phoenix, as the database's own default.
    return todayIn("America/Phoenix");
  }
}
