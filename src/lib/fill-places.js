/**
 * Filling in what a list leaves out of a business's place (Sean, Oct 2026:
 * lists from clients and the old system missing a ZIP, a city or a county),
 * from what it does give, by each ZIP's city, state and county
 * (src/data/zip-places.json). Only what is blank is filled, and only what is
 * certain: a ZIP gives its city, state and county; a city and state give the
 * ZIP when the city has just one, and the county when all its ZIPs are in
 * one; a city with no state, its state when only one state has it (or only
 * one has it in the county given). A county alone says nothing more. Pure.
 */

/** A city as compared: lower case, letters and digits, "St." as Saint, "Ft" as Fort, "Mt" as Mount. */
export function cityKey(city) {
  const words = String(city ?? "").toLowerCase().replace(/[.'’]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
  const as = { st: "saint", ste: "sainte", ft: "fort", mt: "mount" };
  return words.map((w, i) => (i === 0 || w === "st" ? as[w] ?? w : w)).join(" ");
}

/** A county as compared: its name without County, Parish, Borough… */
export const countyKey = (county) => String(county ?? "").toLowerCase().replace(/[.'’]/g, "")
  .replace(/\b(county|parish|borough|census area|municipality|city and borough)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The places, looked up both ways: by ZIP, and by city in a state ({ zips,
 * counties }), and the states a city's name is found in.
 * `zips`: { "54911": ["Appleton", "WI", "Outagamie"] }.
 */
export function placeIndex(zips) {
  const byCity = new Map();
  const cityStates = new Map();
  for (const [zip, [city, state, county]] of Object.entries(zips ?? {})) {
    const key = cityKey(city);
    const at = `${state}|${key}`;
    let c = byCity.get(at);
    if (!c) {
      c = { zips: [], counties: new Map() };
      byCity.set(at, c);
      (cityStates.get(key) ?? cityStates.set(key, new Set()).get(key)).add(state);
    }
    c.zips.push(zip);
    if (county) c.counties.set(countyKey(county), county);
  }
  return { zips: zips ?? {}, byCity, cityStates };
}

/** A ZIP as written, as five digits: ZIP+4's first five; one a spreadsheet took the leading zeros off ("2108"), padded. */
const zip5 = (zip) => {
  const digits = String(zip ?? "").trim();
  if (/^\d{5}(-?\d{4})?$/.test(digits)) return digits.slice(0, 5);
  if (/^\d{3,4}$/.test(digits)) return digits.padStart(5, "0");
  return null;
};

/**
 * Fill in a lead's blank city, state, county and ZIP where its others say
 * for certain (`lead` changed in place). Returns the fields filled, e.g.
 * ["county", "city"]; "zip" too for a ZIP put right (its leading zero back).
 */
export function fillPlace(lead, index) {
  const filled = [];
  const blank = (k) => !String(lead[k] ?? "").trim();
  const set = (k, v) => {
    if (v && blank(k)) {
      lead[k] = v;
      filled.push(k);
    }
  };

  // A ZIP: its city, state and county, unless the state given is another's (one of them is wrong; leave both).
  const z = zip5(lead.zip);
  const place = z ? index.zips[z] : null;
  if (place) {
    const [city, state, county] = place;
    if (!blank("state") && lead.state !== state) return filled;
    if (String(lead.zip).trim().length < 5) {
      lead.zip = z;
      filled.push("zip");
    }
    set("state", state);
    set("city", city);
    set("county", county);
    return filled;
  }

  // No ZIP to go by: the city, in its state.
  if (blank("city") || !blank("zip")) return filled;
  const key = cityKey(lead.city);
  if (blank("state")) {
    // Its state: the only one with a city of that name (in the county given, when there is one).
    const states = [...(index.cityStates.get(key) ?? [])].filter((st) => blank("county") || index.byCity.get(`${st}|${key}`)?.counties.has(countyKey(lead.county)));
    if (states.length !== 1) return filled;
    set("state", states[0]);
  }
  const c = index.byCity.get(`${lead.state}|${key}`);
  if (!c) return filled;
  if (c.zips.length === 1) set("zip", c.zips[0]);
  if (c.counties.size === 1) set("county", [...c.counties.values()][0]);
  return filled;
}
