/**
 * Times on a person's own clock (client, Nov 2026: reminders set in California were read on the
 * business's Arizona clock). A reminder keeps the time zone it was set in; these show it there.
 * Pure, for server pages, components and tests.
 */

/** The zone's short name at that moment ("PST", "MST"); null for an unknown zone. */
export function zoneShort(tz, at = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? null;
  } catch {
    return null;
  }
}

/** A known IANA zone, else `fallback`. */
export function knownZone(tz, fallback) {
  if (!tz) return fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return fallback;
  }
}

/**
 * "11/09/2026, 4:30 PM", with its zone's short name when it is not the business's ("… PST").
 *   iso  the instant; tz  the reminder's zone (or null); business  the business's zone
 */
export function stampIn(iso, tz, business) {
  if (!iso) return "—";
  const zone = knownZone(tz, business);
  const at = new Date(iso);
  const text = new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }).format(at);
  return zone !== business && zoneShort(zone, at) !== zoneShort(business, at) ? `${text} ${zoneShort(zone, at)}` : text;
}
