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

// Each state's cities and counties, sorted, read once a state.
const perState = new Map();

/** A state's cities (as the post office names them) and counties (as leads keep them), to pick from: { cities, counties }. */
export async function statePlaces(state) {
  if (perState.has(state)) return perState.get(state);
  const index = await placesIndex();
  const cities = new Set();
  const counties = new Set();
  for (const [city, st, county] of Object.values(index.zips)) {
    if (st !== state) continue;
    cities.add(city);
    if (county) counties.add(county);
  }
  const sort = (set) => [...set].sort((a, b) => a.localeCompare(b));
  const out = { cities: sort(cities), counties: sort(counties) };
  perState.set(state, out);
  return out;
}

/** What a place's other fields say of its blank ones ({ city, state, zip, county }): only those filled. */
export async function placeFrom(fields) {
  const index = await placesIndex();
  const lead = { ...fields };
  const filled = fillPlace(lead, index);
  return Object.fromEntries(filled.map((k) => [k, lead[k]]));
}

/** A ZIP's place: { zip, city, state, county }, or null for one not on file. ZIP+4 and a lost leading zero read as the ZIP. */
export async function placeOfZip(zip) {
  const index = await placesIndex();
  const t = String(zip ?? "").trim();
  const z = /^\d{5}(-?\d{4})?$/.test(t) ? t.slice(0, 5) : /^\d{3,4}$/.test(t) ? t.padStart(5, "0") : null;
  const place = z ? index.zips[z] : null;
  return place ? { zip: z, city: place[0], state: place[1], county: place[2] } : null;
}
