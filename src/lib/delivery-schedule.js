/**
 * When leads and appointments go to the client (Sean, Oct 2026): each kind
 * straight away, as a call makes it, or held in QA until an administrator
 * sends it, or the schedule clears what is held: every few hours from a
 * starting hour to an ending hour (8 AM to 6 PM Pacific to begin with), every
 * day. Pure, so Settings, the QA page, the clearing endpoint and the tests
 * share it.
 *
 *   { leads, appointments }   "now" or "hold"
 *   every                     hours between clearings; 0: only by hand
 *   from, to                  the first and last hour of the day (0–23)
 *   zone                      the clock they are read on
 */

export const DELIVERY_DEFAULTS = { leads: "now", appointments: "now", every: 0, from: 8, to: 18, zone: "America/Los_Angeles" };
export const DELIVERY_MODES = [["now", "Send immediately"], ["hold", "Hold for QA"]];
export const CLEARING_CHOICES = [[0, "Off: an administrator sends them"], [1, "Every hour"], [2, "Every 2 hours"], [3, "Every 3 hours"], [4, "Every 4 hours"]];
export const ZONES = [["America/Los_Angeles", "Pacific"], ["America/Phoenix", "Arizona"], ["America/Denver", "Mountain"], ["America/Chicago", "Central"], ["America/New_York", "Eastern"]];

const hour = (v, fallback) => (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 23 ? Number(v) : fallback);

/** The settings as kept (app_settings 'delivery'), each value checked, the defaults for the rest. */
export function deliverySettings(value) {
  const v = value ?? {};
  const mode = (m) => (m === "hold" ? "hold" : "now");
  const every = CLEARING_CHOICES.some(([n]) => n === Number(v.every)) ? Number(v.every) : DELIVERY_DEFAULTS.every;
  const from = hour(v.from, DELIVERY_DEFAULTS.from);
  const to = Math.max(from, hour(v.to, DELIVERY_DEFAULTS.to));
  const zone = ZONES.some(([z]) => z === v.zone) ? v.zone : DELIVERY_DEFAULTS.zone;
  return { leads: mode(v.leads), appointments: mode(v.appointments), every, from, to, zone };
}

/** Whether a kind ("lead" or "appointment") waits in QA rather than going straight to the client. */
export const holds = (settings, kind) => (kind === "appointment" ? settings.appointments : settings.leads) === "hold";

/** The hours of the day held ones are cleared at: from, from + every, … up to to. None when clearing is off. */
export function clearingHours({ every, from, to }) {
  if (!every) return [];
  const out = [];
  for (let h = from; h <= to; h += every) out.push(h);
  return out;
}

/** The hour (0–23) and the day ("YYYY-MM-DD") it is at `date` on `zone`'s clock. */
export function clockIn(zone, date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map((p) => [p.type, p.value]));
  return { hour: Number(parts.hour), day: `${parts.year}-${parts.month}-${parts.day}` };
}

/** Whether `date` falls in a clearing hour. */
export const clearingDue = (settings, date = new Date()) => clearingHours(settings).includes(clockIn(settings.zone, date).hour);

/** "1 PM": an hour of the day in words. */
export const hourLabel = (h) => `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`;

/** The next clearing after `date`, in words ("today at 2 PM Pacific", "tomorrow at 8 AM Pacific"); null when off. */
export function nextClearing(settings, date = new Date()) {
  const hours = clearingHours(settings);
  if (!hours.length) return null;
  const zoneName = ZONES.find(([z]) => z === settings.zone)?.[1] ?? settings.zone;
  const now = clockIn(settings.zone, date).hour;
  const later = hours.find((h) => h > now);
  return later != null ? `today at ${hourLabel(later)} ${zoneName}` : `tomorrow at ${hourLabel(hours[0])} ${zoneName}`;
}
