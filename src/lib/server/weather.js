import "server-only";
import { shapeWeather, zip5 } from "@/lib/weather";

/**
 * The weather at a ZIP for Project Info's weather card (Sean, Nov 2026), from free US government sources:
 * the Census Bureau's ZIP areas for where it is, and the National Weather Service for its forecast and the
 * warnings in force. Kept a while in memory: a ZIP's place for a day, its forecast for 20 minutes.
 */

const UA = { "User-Agent": "Lighthouse CRM weather card", Accept: "application/geo+json" };
const PLACE_MS = 24 * 60 * 60 * 1000;
const FORECAST_MS = 20 * 60 * 1000;
const places = new Map();
const forecasts = new Map();

async function json(url, headers = UA) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`);
  return res.json();
}

/** Where a ZIP is ({ lat, lon }), from the Census Bureau's ZIP areas; null for none. */
async function locate(zip) {
  const url = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/1/query"
    + `?where=${encodeURIComponent(`ZCTA5='${zip}'`)}&outFields=INTPTLAT,INTPTLON&returnGeometry=false&f=json`;
  const a = (await json(url, { "User-Agent": UA["User-Agent"] }))?.features?.[0]?.attributes;
  const lat = Number(a?.INTPTLAT);
  const lon = Number(a?.INTPTLON);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)) } : null;
}

/** A ZIP's place: where it is and the Weather Service's forecasts for it. Null for a ZIP it doesn't know. */
async function placeOf(zip) {
  const kept = places.get(zip);
  if (kept && kept.until > Date.now()) return kept.value;
  const at = await locate(zip);
  let value = null;
  if (at) {
    const p = (await json(`https://api.weather.gov/points/${at.lat},${at.lon}`)).properties;
    value = {
      zip, lat: at.lat, lon: at.lon, timeZone: p.timeZone, daily: p.forecast, hourly: p.forecastHourly,
      city: p.relativeLocation?.properties?.city ?? null, state: p.relativeLocation?.properties?.state ?? null,
    };
  }
  places.set(zip, { value, until: Date.now() + PLACE_MS });
  return value;
}

/** The card's weather at `zip` (lib/weather shapeWeather()); null for a ZIP not found. Throws when a source is down. */
export async function weatherAt(zip) {
  const z = zip5(zip);
  if (!z) return null;
  const kept = forecasts.get(z);
  if (kept && kept.until > Date.now()) return kept.value;
  const place = await placeOf(z);
  if (!place) return null;
  const [hourly, daily, alerts] = await Promise.all([
    json(place.hourly),
    json(place.daily),
    // Warnings are a help, not a need: the forecast goes without them.
    json(`https://api.weather.gov/alerts/active?point=${place.lat},${place.lon}`).catch(() => ({ features: [] })),
  ]);
  const value = shapeWeather({
    place: { zip: z, city: place.city, state: place.state, timeZone: place.timeZone },
    hourly: hourly?.properties?.periods ?? [], daily: daily?.properties?.periods ?? [], alerts: alerts?.features ?? [],
  });
  forecasts.set(z, { value, until: Date.now() + FORECAST_MS });
  return value;
}
