/** The business's day: its time zone, and what date it is there now. */

import "server-only";
import { cache } from "react";
import { todayIn } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

/**
 * The business's time zone (business_tz(): the business_timezone setting,
 * America/Phoenix until set). "Today", "this week" and each day of the
 * reports follow it.
 *
 * The same for everyone, and set only in the database, so the server keeps
 * it for a few minutes rather than asking on every page (nearly every page
 * needs it): one query fewer on each.
 */
const ZONE_KEPT_MS = 5 * 60_000;
let zoneKept = null; // { zone, until }

export const getBusinessTimeZone = cache(async function getBusinessTimeZone() {
  if (zoneKept && zoneKept.until > Date.now()) return zoneKept.zone;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("business_tz");
  const zone = data || "America/Phoenix";
  // Kept only when the database answered: a failed read is asked again next time.
  if (!error && data) zoneKept = { zone, until: Date.now() + ZONE_KEPT_MS };
  return zone;
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
