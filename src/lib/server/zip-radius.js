import "server-only";
import { MAX_RADIUS_MILES, zipsWithin } from "@/lib/list-builder";

/**
 * The ZIPs within a radius of a ZIP (List Builder, Oct 2026), from the US
 * Census Bureau's ZIP code points (src/data/zip-centroids.json, public domain):
 * nearest first, or null when the ZIP is not one of the Census's.
 *
 * The table (about 1 MB) is read the first time it is needed, not when a page
 * starts: every page that can call these would otherwise load it on a cold
 * start (Oct 2026: List Builder slow to first open).
 */
let loading = null;
const zipTable = () => (loading ??= import("@/data/zip-centroids.json").then((m) => m.default ?? m));

export async function zipsAround(zip, miles) {
  const m = Math.min(MAX_RADIUS_MILES, Math.max(0, Number(miles) || 0));
  if (!/^\d{5}$/.test(String(zip ?? "")) || !m) return null;
  return zipsWithin((await zipTable()).zips, String(zip), m);
}

/** Those of these ZIPs the Census's map doesn't have (made up, or a PO box ZIP, which has no area). */
export async function unmappedZips(zips) {
  const table = await zipTable();
  return (zips ?? []).filter((z) => !table.zips[z]);
}

/** A ZIP's Census point, [lat, lon], or null. */
export async function zipPoint(zip) {
  return (await zipTable()).zips[String(zip ?? "").trim().slice(0, 5)] ?? null;
}
