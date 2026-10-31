"use server";

/**
 * A lead's place as it is typed (Sean, Oct 2026): a state's cities and
 * counties to pick from, so they are spelled one way; and a ZIP's city,
 * state and county, or a city's ZIP and county, filled in where blank.
 */

import { placeFrom, placeOfZip, statePlaces } from "@/lib/server/zip-places";

const text = (v, max) => String(v ?? "").trim().slice(0, max);

/** A state's cities and counties: { cities, counties }; none for what is not a state. */
export async function placesInState(state) {
  const st = text(state, 2).toUpperCase();
  return /^[A-Z]{2}$/.test(st) ? statePlaces(st) : { cities: [], counties: [] };
}

/** The blank ones of { city, state, zip, county } that the others say for certain. */
export async function fillPlaceFields(fields) {
  return placeFrom({ city: text(fields?.city, 60), state: text(fields?.state, 2).toUpperCase(), zip: text(fields?.zip, 10), county: text(fields?.county, 60) });
}

/** A ZIP typed: its city, state and county ({ zip, city, state, county }), or null when it is not a ZIP on file. */
export async function zipPlace(zip) {
  return placeOfZip(text(zip, 10));
}
