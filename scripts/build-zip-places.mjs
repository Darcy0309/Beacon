/**
 * Builds src/data/zip-places.json, each ZIP's city, state and county, for
 * the import to fill in what a list leaves out (Oct 2026), from GeoNames'
 * US postal codes (CC BY 4.0: credit GeoNames, www.geonames.org).
 *
 *   curl -O https://download.geonames.org/export/zip/US.zip && unzip US.zip
 *   node scripts/build-zip-places.mjs path/to/US.txt
 *
 * Kept: { zips: { "54911": ["Appleton", "WI", "Outagamie"] } }, the county as
 * leads keep it (no "County"); military addresses (APO/FPO, no state) left out.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [file] = process.argv.slice(2);
if (!file) {
  console.error("Usage: node scripts/build-zip-places.mjs path/to/US.txt");
  process.exit(1);
}
const zips = {};
for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
  const [country, zip, city, , state, county] = line.split("\t");
  if (country !== "US" || !/^\d{5}$/.test(zip ?? "") || !/^[A-Z]{2}$/.test(state ?? "") || !city) continue;
  zips[zip] ??= [city.trim(), state, (county ?? "").trim() || null];
}
const out = {
  source: "GeoNames US postal codes (www.geonames.org, CC BY 4.0): each ZIP's city, state and county",
  zips: Object.fromEntries(Object.entries(zips).sort(([a], [b]) => a.localeCompare(b))),
};
const target = fileURLToPath(new URL("../src/data/zip-places.json", import.meta.url));
writeFileSync(target, JSON.stringify(out));
console.log(`${Object.keys(zips).length} ZIPs written to ${target}`);
