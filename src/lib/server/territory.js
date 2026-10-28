import "server-only";
import places from "@/data/us-territory.json";
import countyZipTable from "@/data/county-zips.json";
import cityPoints from "@/data/city-points.json";

/**
 * Counties and cities by state, and the ZIP codes in each county (List
 * Builder, Oct 2026), from the US Census Bureau's files (public domain):
 * src/data/us-territory.json (2023 Gazetteer counties and places) and
 * src/data/county-zips.json (2020 ZIP-to-county file: a ZIP is in a county
 * holding a quarter or more of its land, and always in the one holding most).
 * A county or city is named as the List Builder keeps it: "Maricopa County, AZ".
 */

const label = (name, st) => `${name}, ${st}`;

/** Up to `limit` counties or cities matching `q`, from `states` (or every state): those starting with it first. */
export function suggestPlaces(kind, states, q, limit = 12) {
  const t = String(q ?? "").trim().toLowerCase();
  if (!t) return [];
  const pool = (states?.length ? states : Object.keys(places.states)).filter((st) => places.states[st]);
  const starts = [];
  const contains = [];
  for (const st of pool) {
    const names = kind === "counties" ? places.states[st].counties.map(([, n]) => n) : places.states[st].cities;
    for (const n of names) {
      const low = n.toLowerCase();
      if (low.startsWith(t)) starts.push(label(n, st));
      else if (low.includes(t)) contains.push(label(n, st));
      if (starts.length >= limit) return starts;
    }
  }
  return [...starts, ...contains].slice(0, limit);
}

/**
 * A county as kept ("Maricopa County, AZ", or "Maricopa, AZ"): its Census id,
 * or null. One typed without its state ("Maricopa") is looked for in the
 * states picked, and taken when just one of them has it.
 */
export function countyId(text, states = []) {
  const t = String(text ?? "").trim();
  const m = /^(.+?),\s*([A-Za-z]{2})$/.exec(t);
  const want = (m ? m[1] : t).trim().toLowerCase();
  const bare = (n) => n.toLowerCase().replace(/\s+(county|parish|borough|census area|municipality|city and borough)$/, "");
  const find = (st) => {
    const list = places.states[st]?.counties ?? [];
    return (list.find(([, n]) => n.toLowerCase() === want) ?? list.find(([, n]) => bare(n) === bare(want)))?.[0] ?? null;
  };
  if (m) return find(m[2].toUpperCase());
  const hits = (states ?? []).map(find).filter(Boolean);
  return hits.length === 1 ? hits[0] : null;
}

/** Each county's ZIP codes: [{ county, zips }] (none for one not found). */
export function countyZipLists(counties, states = []) {
  return (counties ?? []).map((c) => {
    const id = countyId(c, states);
    return { county: c, zips: id ? countyZipTable.counties[id] ?? [] : [] };
  });
}

/** Every ZIP in these counties, each once. */
export function zipsOfCounties(counties, states = []) {
  return [...new Set(countyZipLists(counties, states).flatMap((c) => c.zips))];
}

/** Every county or city in these states, a list for each: [{ state, names }], names as kept ("Maricopa County, AZ"). */
export function placesOf(kind, states) {
  return (states ?? []).filter((st) => places.states[st]).map((st) => ({
    state: st,
    names: (kind === "counties" ? places.states[st].counties.map(([, n]) => n) : places.states[st].cities).map((n) => label(n, st)),
  }));
}

/**
 * A county or city as typed, checked against the Census's names: { name } as
 * kept ("Maricopa County, AZ", "Mesa, AZ"), or { why } it can't be taken.
 * One typed without its state is looked for in the states picked.
 */
export function checkPlace(kind, text, states = []) {
  const t = String(text ?? "").trim();
  const m = /^(.+?),\s*([A-Za-z]{2})$/.exec(t);
  const want = (m ? m[1] : t).trim().toLowerCase();
  const bare = (n) => n.toLowerCase().replace(/\s+(county|parish|borough|census area|municipality|city and borough)$/, "");
  const noun = kind === "counties" ? "county" : "city";
  const find = (st) => {
    const s = places.states[st];
    if (!s) return null;
    if (kind === "counties") {
      const hit = s.counties.find(([, n]) => n.toLowerCase() === want) ?? s.counties.find(([, n]) => bare(n) === bare(want));
      return hit ? label(hit[1], st) : null;
    }
    const hit = s.cities.find((n) => n.toLowerCase() === want);
    return hit ? label(hit, st) : null;
  };
  if (m) {
    const st = m[2].toUpperCase();
    if (!places.states[st]) return { why: `${t}: ${st} is not a state` };
    return find(st) ? { name: find(st) } : { why: `${t}: no ${noun} by that name in ${st}` };
  }
  if (!states.length) return { why: `${t}: pick its state first, or type it as "${t}, AZ"` };
  const hits = states.map(find).filter(Boolean);
  if (hits.length === 1) return { name: hits[0] };
  if (hits.length > 1) return { why: `${t} is in more than one state picked: choose it from the suggestions` };
  return { why: `${t}: no ${noun} by that name in ${states.join(", ")}` };
}

/** A city's Census point, [lat, lon] (src/data/city-points.json: the 2023 Gazetteer's places), or null. */
export function cityPoint(city, st) {
  const name = String(city ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/\s+(city|town|village|cdp)$/, "");
  return cityPoints.cities[`${String(st ?? "").trim().toUpperCase()}|${name}`] ?? null;
}
