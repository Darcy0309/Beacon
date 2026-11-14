#!/usr/bin/env node
/** Unit tests for Project Info's weather card (Sean, Nov 2026): the Weather Service's forecast, read for the card. */
import { shapeWeather, skyKind, zip5 } from "../../src/lib/weather.js";

let failures = 0;
const is = (label, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label} — got ${JSON.stringify(got)}`); failures++; }
};

is("the sky in a word", ["Sunny", "Mostly Sunny", "Partly Cloudy", "Mostly Cloudy", "Chance Rain Showers", "Light Snow Likely", "Freezing Drizzle", "Chance T-storms", "Patchy Fog", "Breezy"].map(skyKind),
  ["sun", "partly", "partly", "cloud", "rain", "snow", "snow", "storm", "fog", "wind"]);
is("a ZIP's five digits", [zip5("68022"), zip5(" 68022-1234"), zip5(""), zip5(null), zip5("abc")], ["68022", "68022", null, null, null]);

const tz = "America/Chicago";
// Friday Nov 13, 2026, 4 PM in Omaha (22:00 UTC).
const now = new Date("2026-11-13T22:00:00Z");
const hourly = Array.from({ length: 30 }, (_, i) => {
  const start = new Date(Date.UTC(2026, 10, 13, 21 + i));
  return {
    startTime: start.toISOString(), endTime: new Date(start.getTime() + 3600e3).toISOString(), isDaytime: i < 2,
    temperature: 43 - i, probabilityOfPrecipitation: { value: i === 5 ? 20 : 0 }, relativeHumidity: { value: 50 },
    windSpeed: "5 mph", windDirection: "S", shortForecast: i < 2 ? "Sunny" : "Clear",
  };
});
const period = (start, isDaytime, temperature, shortForecast, rain = 0, detailedForecast = "") => ({ startTime: start, isDaytime, temperature, shortForecast, detailedForecast, windSpeed: "10 mph", windDirection: "NW", probabilityOfPrecipitation: { value: rain } });
const daily = [
  period("2026-11-13T18:00:00-06:00", false, 25, "Clear"),
  period("2026-11-14T06:00:00-06:00", true, 45, "Partly Sunny", 0, "Partly sunny, with a high near 45."), period("2026-11-14T18:00:00-06:00", false, 24, "Mostly Cloudy", 30, "Mostly cloudy, with a low around 24."),
  period("2026-11-15T06:00:00-06:00", true, 51, "Heavy Snow", 80), period("2026-11-15T18:00:00-06:00", false, 26, "Snow"),
];
const alerts = [
  { properties: { event: "Wind Advisory", severity: "Minor", ends: "2026-11-14T18:00:00-06:00" } },
  { properties: { event: "Winter Storm Warning", severity: "Severe", ends: "2026-11-15T18:00:00-06:00" } },
  { properties: { event: "Winter Storm Warning", severity: "Severe", ends: "2026-11-15T20:00:00-06:00" } },
];
const w = shapeWeather({ place: { city: "Omaha", state: "NE", zip: "68022", timeZone: tz }, hourly, daily, alerts, now });

is("now: the hour at hand, not one gone", [w.now.temp, w.now.sky, w.now.kind, w.now.precip, w.now.humidity, w.now.wind], [42, "Sunny", "sun", 0, 50, "5 mph"]);
is("the next 24 hours", w.hours.length, 24);
is("…every 3rd hour labelled, on the place's clock", w.hours.filter((h) => h.label).map((h) => h.label).slice(0, 3), ["4PM", "7PM", "10PM"]);
is("tonight first, its low alone", [w.days[0].name, w.days[0].high, w.days[0].low, w.days[0].kind, w.days[0].night], ["Fri", null, 25, "sun", true]);
is("a day, clicked: its date, its forecast in words, the wind, its hours on the place's clock",
  [w.days[1].date, w.days[1].title, w.days[1].detail, w.days[1].nightDetail, w.days[1].wind, w.days[1].hours.length, w.days[1].hours.find((h) => h.label)?.label],
  ["2026-11-14", "Saturday, Nov 14", "Partly sunny, with a high near 45.", "Mostly cloudy, with a low around 24.", "10 mph NW", 21, "12AM"]);
is("…then each day with its high and the night's low, the wetter half's chance", w.days.slice(1).map((d) => [d.name, d.high, d.low, d.kind, d.precip]), [["Sat", 45, 24, "partly", 30], ["Sun", 51, 26, "snow", 80]]);
is("warnings: the worst first, each once", w.alerts.map((a) => a.event), ["Winter Storm Warning", "Wind Advisory"]);
is("no forecast: nothing at hand", shapeWeather({ place: { timeZone: tz } }).now, null);

if (failures) {
  console.error(`\n${failures} weather check(s) failed`);
  process.exit(1);
}
console.log("\nAll weather checks passed.");
