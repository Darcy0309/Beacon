/**
 * The weather card on Project Info (Sean, Nov 2026): the forecast where the project is, so a manager sees a
 * snowstorm, rain or a flood coming before a day of calls. The National Weather Service's forecast, read
 * into what the card shows. Pure, for the server and the tests.
 */

/** The sky in a word, for the card's icons: sun, partly, cloud, rain, snow, storm, fog or wind. */
export function skyKind(text) {
  const t = String(text ?? "").toLowerCase();
  if (/thunder|t-storm|tstorm/.test(t)) return "storm";
  if (/snow|sleet|ice|freezing|blizzard|flurr|wintry/.test(t)) return "snow";
  if (/rain|shower|drizzle/.test(t)) return "rain";
  if (/fog|haze|smoke|mist/.test(t)) return "fog";
  if (/partly|mostly sunny|mostly clear|few clouds/.test(t)) return "partly";
  if (/cloud|overcast/.test(t)) return "cloud";
  if (/wind|breez|blustery/.test(t)) return "wind";
  return "sun";
}

const pct = (v) => (v && typeof v === "object" ? v.value : v) ?? null;

/** "Fri", "2 PM": a moment on the place's clock. */
const weekday = (iso, timeZone) => new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date(iso));
const hourOf = (iso, timeZone) => new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric" }).format(new Date(iso)).replace(" ", "");

/**
 * The card's weather, from the Weather Service's answers:
 *   place    { city, state, zip, timeZone }
 *   hourly   its hourly forecast's periods
 *   daily    its day-and-night forecast's periods
 *   alerts   its active alerts' features
 *   now      the moment it is (for the hours still to come)
 * Returns { place, now, hours, days, alerts }: now the hour at hand; hours the next 24, every 3rd labelled;
 * days up to 7, each with its high and low; alerts the warnings in force, the worst first.
 */
export function shapeWeather({ place, hourly = [], daily = [], alerts = [], now = new Date() }) {
  const tz = place?.timeZone || "America/Chicago";
  const ahead = hourly.filter((p) => new Date(p.endTime) > now);
  const first = ahead[0] ?? hourly[0] ?? null;
  const hours = ahead.slice(0, 24).map((p, i) => ({
    at: p.startTime, label: i % 3 === 0 ? hourOf(p.startTime, tz) : null, temp: p.temperature, precip: pct(p.probabilityOfPrecipitation) ?? 0,
  }));

  // Day and night halves into days: the day's high, the night after's low.
  const days = [];
  for (let i = 0; i < daily.length && days.length < 7; i += 1) {
    const p = daily[i];
    if (p.isDaytime) {
      const night = daily[i + 1] && !daily[i + 1].isDaytime ? daily[i + 1] : null;
      days.push({
        name: weekday(p.startTime, tz), high: p.temperature, low: night?.temperature ?? null, sky: p.shortForecast, kind: skyKind(p.shortForecast),
        precip: Math.max(pct(p.probabilityOfPrecipitation) ?? 0, pct(night?.probabilityOfPrecipitation) ?? 0), night: false,
      });
      if (night) i += 1;
    } else if (!days.length) {
      // Tonight, the day's daytime gone: its low alone.
      days.push({ name: weekday(p.startTime, tz), high: null, low: p.temperature, sky: p.shortForecast, kind: skyKind(p.shortForecast), precip: pct(p.probabilityOfPrecipitation) ?? 0, night: true });
    }
  }

  const ORDER = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3 };
  const warnings = alerts
    .map((f) => f?.properties ?? f)
    .filter((a) => a?.event)
    .map((a) => ({ event: a.event, severity: a.severity ?? "Unknown", headline: a.headline ?? null, ends: a.ends ?? a.expires ?? null }))
    .sort((a, b) => (ORDER[a.severity] ?? 4) - (ORDER[b.severity] ?? 4));
  // One line each: the same warning issued twice is said once.
  const seen = new Set();
  const unique = warnings.filter((a) => (seen.has(a.event) ? false : seen.add(a.event)));

  return {
    place,
    now: first ? {
      temp: first.temperature, sky: first.shortForecast, kind: skyKind(first.shortForecast), night: first.isDaytime === false,
      precip: pct(first.probabilityOfPrecipitation) ?? 0, humidity: pct(first.relativeHumidity), wind: first.windSpeed ?? null, windFrom: first.windDirection ?? null,
    } : null,
    hours,
    days,
    alerts: unique,
  };
}

/** A ZIP's first five digits; null for anything else. */
export const zip5 = (zip) => String(zip ?? "").match(/\b\d{5}\b/)?.[0] ?? String(zip ?? "").match(/\d{5}/)?.[0] ?? null;
