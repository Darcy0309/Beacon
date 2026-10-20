/**
 * The Business tab's details on a lead (Sean, Oct 2026): the choices it
 * offers, and how they read on the lead page and the lead sheet. Pure.
 */

/** The kinds of vehicles a business runs. */
export const AUTO_TYPES = [
  ["cars", "Cars"], ["vans", "Vans"], ["delivery_trucks", "Delivery trucks"], ["big_rigs", "Big rigs"], ["tow_trucks", "Tow trucks / wreckers"],
];

/** How far its vehicles travel, in miles. */
export const TRAVEL_RADII = ["25", "50", "100", "250", "300", "500+"];

const label = (list, key) => list.find(([k]) => k === key)?.[1] ?? key;
const plural = (n, one, many = `${one}s`) => `${n} ${Number(n) === 1 ? one : many}`;
const has = (v) => v !== null && v !== undefined && String(v).trim() !== "";

/** "2 · Own · 15 years old, 2 stories, 1.5 acres" (what there is of it), or null. */
export function locationsLine(l) {
  const building = [
    has(l.building_age) ? `${plural(l.building_age, "year")} old` : null,
    has(l.building_stories) ? plural(l.building_stories, "story", "stories") : null,
    has(l.building_acres) ? plural(Number(l.building_acres), "acre") : null,
  ].filter(Boolean).join(", ");
  const parts = [has(l.location) ? String(l.location) : null, l.location_ownership === "own" ? "Own" : l.location_ownership === "lease" ? "Lease" : null, building || null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** "20 (15 full-time, 5 part-time)", or null. */
export function employeesLine(l) {
  const split = [has(l.employees_full_time) ? `${l.employees_full_time} full-time` : null, has(l.employees_part_time) ? `${l.employees_part_time} part-time` : null].filter(Boolean).join(", ");
  if (!has(l.employees) && !split) return null;
  return [has(l.employees) ? String(l.employees) : null, split ? `(${split})` : null].filter(Boolean).join(" ");
}

/** "11 · Vans, Delivery trucks · 8 drivers · within 100 miles", or null. */
export function autosLine(l) {
  const kinds = (l.auto_types ?? []).map((k) => label(AUTO_TYPES, k)).join(", ");
  const parts = [has(l.autos) ? String(l.autos) : null, kinds || null, has(l.drivers) ? plural(l.drivers, "driver") : null,
    l.travel_radius ? `within ${l.travel_radius} miles` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** "10%", or null. */
export const subcontractorsLine = (l) => (has(l.subcontractors_pct) ? `${Number(l.subcontractors_pct)}%` : null);

/** A name for the cargo list: trimmed, spaces run together, at most 100 characters; null for none. */
export const cargoName = (v) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 100) || null;

/**
 * The cargo names in a file loaded onto the list: one a line, or the first
 * column of a CSV (a "Cargo" heading is skipped). Quotes come off.
 */
export function cargoNamesFromText(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => {
      const m = /^\s*"((?:[^"]|"")*)"|^([^,]*)/.exec(line);
      return cargoName((m?.[1] ?? m?.[2] ?? "").replace(/""/g, '"'));
    })
    .filter((v, i) => v && !(i === 0 && /^cargo( types?| name)?$/i.test(v)));
}

/** "Yes", "No", or null for not known: claims in the last three years. */
export const yesNo = (v) => (v === true ? "Yes" : v === false ? "No" : null);

/** An XMOD to two places, as it is written: "0.85", "1.50"; null for none. */
export const xmodText = (v) => (has(v) && Number.isFinite(Number(v)) ? Number(v).toFixed(2) : null);
