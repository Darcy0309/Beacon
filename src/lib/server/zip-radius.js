import "server-only";
import table from "@/data/zip-centroids.json";
import { MAX_RADIUS_MILES, zipsWithin } from "@/lib/list-builder";

/**
 * The ZIPs within a radius of a ZIP (List Builder, Oct 2026), from the US
 * Census Bureau's ZIP code points (src/data/zip-centroids.json, public domain):
 * nearest first, or null when the ZIP is not one of the Census's.
 */
export function zipsAround(zip, miles) {
  const m = Math.min(MAX_RADIUS_MILES, Math.max(0, Number(miles) || 0));
  if (!/^\d{5}$/.test(String(zip ?? "")) || !m) return null;
  return zipsWithin(table.zips, String(zip), m);
}

/** Those of these ZIPs the Census's map doesn't have (made up, or a PO box ZIP, which has no area). */
export function unmappedZips(zips) {
  return (zips ?? []).filter((z) => !table.zips[z]);
}
