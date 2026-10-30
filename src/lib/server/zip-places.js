import "server-only";
import { fillPlace, placeIndex } from "@/lib/fill-places";

/**
 * Each ZIP's city, state and county (src/data/zip-places.json, from GeoNames,
 * CC BY 4.0), indexed both ways the first time an import needs it (about
 * 1.5 MB, so not when a page starts).
 */
let indexOnce = null;
const placesIndex = () => (indexOnce ??= import("@/data/zip-places.json").then((m) => placeIndex((m.default ?? m).zips)));

/**
 * Fill in the leads' blank cities, states, counties and ZIPs from what each
 * does give (fillPlace). Returns how many of each were filled: { city, state, county, zip }.
 */
export async function fillPlaces(leads) {
  const index = await placesIndex();
  const counts = { city: 0, state: 0, county: 0, zip: 0 };
  for (const lead of leads) for (const k of fillPlace(lead, index)) counts[k] += 1;
  return counts;
}
