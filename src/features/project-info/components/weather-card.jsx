"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Cloud, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Loader2, MapPin, Moon, Sun, Wind } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

const ICONS = { sun: Sun, partly: CloudSun, cloud: Cloud, rain: CloudRain, snow: CloudSnow, storm: CloudLightning, fog: CloudFog, wind: Wind };
const NIGHT = { sun: Moon, partly: CloudMoon };
const TINT = { sun: "text-amber-400", partly: "text-amber-300", cloud: "text-slate-400", rain: "text-sky-400", snow: "text-sky-200", storm: "text-violet-400", fog: "text-slate-400", wind: "text-teal-400" };

function SkyIcon({ kind, night = false, className = "" }) {
  const Icon = (night && NIGHT[kind]) || ICONS[kind] || Sun;
  return <Icon className={`${TINT[kind] ?? ""} ${className}`} aria-hidden />;
}

/** °F as whole °C. */
const celsius = (f) => Math.round(((Number(f) - 32) * 5) / 9);

// The answers already had, by ZIP: hovering again shows them at once.
const kept = new Map();
const OPEN_MS = 250;
const CLOSE_MS = 200;

/**
 * The Weather button on the lead sheet (Sean, Nov 2026): hovered, clicked or tapped, a card with the forecast
 * at the project's ZIP from the National Weather Service: the hour at hand, the next 24 hours' temperature,
 * 7 days, and any warning in force (a winter storm, a flood). The button itself goes nowhere: only the
 * card's Open Google weather opens Google's, in a new tab.
 * `zip` the project's; `href` Google's weather for it; `place` its city and state ("Hayward, WI"); `align` the
 * card's edge to the button's ("start" in the lead sheet's top bar, on the left).
 */
export default function WeatherCard({ zip, href, place = "", align = "end" }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(() => kept.get(zip) ?? null);
  const [error, setError] = useState("");
  const timer = useRef(null);

  useEffect(() => {
    if (!open || data || error) return;
    let gone = false;
    fetch(`/api/weather?zip=${encodeURIComponent(zip)}`)
      .then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(new Error(d.error)))))
      .then((d) => {
        kept.set(zip, d);
        if (!gone) setData(d);
      })
      .catch((err) => !gone && setError(err.message || "The weather is unavailable right now."));
    return () => {
      gone = true;
    };
  }, [open, data, error, zip]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const later = (to, ms) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(to), ms);
  };
  const stay = () => clearTimeout(timer.current);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button type="button" data-project-weather aria-haspopup="dialog" aria-expanded={open} title={`The weather at ${zip}`}
          onMouseEnter={() => later(true, OPEN_MS)} onMouseLeave={() => later(false, CLOSE_MS)}
          // A click (or a tap, with no hover) opens it, and keeps it open; outside or Escape closes it.
          onClick={() => later(true, 0)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground">
          <CloudSun className="size-4" aria-hidden /> Weather · {zip}
        </button>
      </PopoverAnchor>
      <PopoverContent align={align} className="w-[22rem] p-0" data-weather-card
        onOpenAutoFocus={(e) => e.preventDefault()} onCloseAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={stay} onMouseLeave={() => later(false, CLOSE_MS)}>
        <div className="flex items-center justify-between gap-2 border-b border-[var(--panel-border)] px-4 py-2.5">
          <span className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Weather</span>
          <span className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground" data-weather-place>
            <MapPin className="size-3 shrink-0" aria-hidden />
            {place ? `${place} ${zip}` : data?.place?.city ? `${data.place.city}, ${data.place.state} ${zip}` : zip}
          </span>
        </div>
        {error ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground" data-weather-error>{error}</p>
        ) : !data ? (
          <p className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Reading the forecast…</p>
        ) : (
          <WeatherBody data={data} />
        )}
        <div className="flex items-center justify-between gap-2 border-t border-[var(--panel-border)] px-4 py-2 text-[0.65rem] text-muted-foreground">
          <span>National Weather Service</span>
          <a href={href} target="_blank" rel="noreferrer" data-weather-google className="font-semibold uppercase tracking-[0.12em] text-primary hover:underline">Open Google weather</a>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The card's forecast: the hour at hand to begin with; a day clicked in the row below (Nov 2026: "you cannot
 * click to view the coming days"), that day instead: its high and low, sky, chance of rain or snow, wind,
 * the Weather Service's forecast in words for the day and the night, and its hours. The same day again, or
 * Now, back to the hour at hand.
 */
function WeatherBody({ data }) {
  const { now, hours, days, alerts } = data;
  const [pick, setPick] = useState(null);
  const day = pick != null ? days[pick] : null;
  return (
    <div className="space-y-3 px-4 py-3">
      {alerts.length ? (
        <ul className="space-y-1" data-weather-alerts>
          {alerts.slice(0, 3).map((a) => (
            <li key={a.event} className={`flex items-start gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium ${/Extreme|Severe/.test(a.severity) ? "bg-rose-500/15 text-rose-600 dark:text-rose-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>{a.event}{a.ends ? <span className="font-normal opacity-80"> · until {new Date(a.ends).toLocaleString("en-US", { timeZone: data.place.timeZone, weekday: "short", hour: "numeric", minute: "2-digit" })}</span> : null}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {day ? (
        <div className="space-y-2" data-weather-day={day.date ?? pick}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold" data-weather-day-title>{day.title ?? day.name}</span>
            <button type="button" onClick={() => setPick(null)} data-weather-back
              className="rounded px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-primary hover:bg-primary/10">Now</button>
          </div>
          <div className="flex items-center gap-3">
            <SkyIcon kind={day.kind} night={day.night} className="size-11 shrink-0" />
            <span className="flex shrink-0 flex-col">
              <span className="text-3xl font-semibold tabular-nums leading-none">
                {day.high != null ? `${day.high}°` : `${day.low}°`}<span className="align-top text-sm font-normal text-muted-foreground">F</span>
                {day.high != null && day.low != null ? <span className="ml-1 text-base font-normal text-muted-foreground">/ {day.low}°</span> : null}
              </span>
              <span className="mt-1 text-xs tabular-nums text-muted-foreground">
                {day.high != null ? `${celsius(day.high)}°C` : `${celsius(day.low)}°C`}{day.high != null && day.low != null ? ` / ${celsius(day.low)}°C` : ""}
              </span>
            </span>
            <span className="min-w-0 text-xs leading-relaxed text-muted-foreground">
              <span className="block font-medium text-foreground">{day.sky}</span>
              Precipitation: {day.precip}%
              {day.wind ? <span className="block">Wind: {day.wind}</span> : null}
            </span>
          </div>
          {day.detail || day.nightDetail ? (
            <div className="space-y-1 rounded-md bg-muted/50 px-2.5 py-2 text-xs leading-relaxed" data-weather-day-detail>
              {day.detail ? <p><span className="font-semibold">Day:</span> {day.detail}</p> : null}
              {day.nightDetail ? <p><span className="font-semibold">Night:</span> {day.nightDetail}</p> : null}
            </div>
          ) : null}
          {day.hours?.length > 1 ? <HourLine hours={day.hours} label={`${day.title ?? day.name}, by the hour`} />
            : <p className="text-center text-[0.7rem] text-muted-foreground">No hour-by-hour forecast this far ahead.</p>}
        </div>
      ) : (
        <>
          {now ? (
            <div className="flex items-center gap-3" data-weather-now>
              <SkyIcon kind={now.kind} night={now.night} className="size-11 shrink-0" />
              <span className="flex shrink-0 flex-col">
                <span className="text-4xl font-semibold tabular-nums leading-none">{now.temp}°<span className="align-top text-base font-normal text-muted-foreground">F</span></span>
                {/* The same in Celsius, beneath (Nov 2026). */}
                <span className="mt-1 text-sm tabular-nums text-muted-foreground" data-weather-celsius>{celsius(now.temp)}°C</span>
              </span>
              <span className="min-w-0 text-xs leading-relaxed text-muted-foreground">
                <span className="block truncate font-medium text-foreground">{now.sky}</span>
                Precipitation: {now.precip}%
                {now.humidity != null ? <> · Humidity: {now.humidity}%</> : null}
                {now.wind ? <span className="block">Wind: {now.wind}{now.windFrom ? ` ${now.windFrom}` : ""}</span> : null}
              </span>
            </div>
          ) : null}
          {hours.length > 1 ? <HourLine hours={hours} label="The next 24 hours" /> : null}
        </>
      )}
      {days.length ? (
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }} data-weather-days>
          {days.map((d, i) => {
            const on = pick === i || (pick == null && i === 0);
            return (
              <button key={i} type="button" onClick={() => setPick(pick === i ? null : i)} aria-pressed={pick === i} data-weather-day-pick={i}
                className={`flex flex-col items-center gap-1 rounded-md py-1.5 text-xs transition-colors hover:bg-muted ${on ? "bg-muted/70 ring-1 ring-[var(--panel-border)]" : ""}`}
                title={`${d.title ?? d.name}: ${d.sky}${d.precip ? ` · ${d.precip}% precipitation` : ""}`}>
                <span className="font-medium">{d.name}</span>
                <SkyIcon kind={d.kind} night={d.night} className="size-5" />
                <span className="tabular-nums"><span className="font-semibold">{d.high != null ? `${d.high}°` : "—"}</span> <span className="text-muted-foreground">{d.low != null ? `${d.low}°` : ""}</span></span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Hours' temperatures, as a filled line, the labelled ones named. `label` what it shows, for screen readers. */
function HourLine({ hours, label }) {
  const W = 320;
  const H = 74;
  const top = 16;
  const bottom = 18;
  const temps = hours.map((h) => h.temp);
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const x = (i) => 4 + (i / (hours.length - 1)) * (W - 8);
  const y = (t) => top + (hi === lo ? 0.5 : 1 - (t - lo) / (hi - lo)) * (H - top - bottom);
  const line = hours.map((h, i) => `${x(i)},${y(h.temp)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${label}: ${lo}° to ${hi}°`} data-weather-hours>
      <polygon points={`${x(0)},${H - bottom} ${line} ${x(hours.length - 1)},${H - bottom}`} fill="color-mix(in srgb, var(--neon-amber, #f59e0b) 22%, transparent)" />
      <polyline points={line} fill="none" stroke="var(--neon-amber, #f59e0b)" strokeWidth="2" strokeLinejoin="round" />
      {hours.map((h, i) => (h.label ? (
        <g key={h.at} textAnchor={i === 0 ? "start" : i === hours.length - 1 ? "end" : "middle"}>
          <text x={x(i)} y={y(h.temp) - 5} fontSize="9" fontWeight="600" fill="currentColor">{h.temp}</text>
          <text x={x(i)} y={H - 4} fontSize="9" fill="var(--muted-foreground)">{h.label}</text>
        </g>
      ) : null))}
    </svg>
  );
}
