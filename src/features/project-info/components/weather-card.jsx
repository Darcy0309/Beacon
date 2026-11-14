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
 * The Weather button on Project Info (Sean, Nov 2026): Google's weather for the project's ZIP in a new tab,
 * and, hovered (or focused), a card with the forecast there from the National Weather Service: the hour at
 * hand, the next 24 hours' temperature, 7 days, and any warning in force (a winter storm, a flood).
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
        <a href={href} target="_blank" rel="noreferrer" data-project-weather title={`Google's weather for ${zip}, in a new tab`}
          onMouseEnter={() => later(true, OPEN_MS)} onMouseLeave={() => later(false, CLOSE_MS)}
          onFocus={() => later(true, 0)} onBlur={() => later(false, CLOSE_MS)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground">
          <CloudSun className="size-4" aria-hidden /> Weather · {zip}
        </a>
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
          <a href={href} target="_blank" rel="noreferrer" className="font-semibold uppercase tracking-[0.12em] text-primary hover:underline">Open Google weather</a>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function WeatherBody({ data }) {
  const { now, hours, days, alerts } = data;
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
      {hours.length > 1 ? <HourLine hours={hours} /> : null}
      {days.length ? (
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }} data-weather-days>
          {days.map((d, i) => (
            <div key={i} className={`flex flex-col items-center gap-1 rounded-md py-1.5 text-xs ${i === 0 ? "bg-muted/60" : ""}`} title={`${d.sky}${d.precip ? ` · ${d.precip}% precipitation` : ""}`}>
              <span className="font-medium">{d.name}</span>
              <SkyIcon kind={d.kind} night={d.night} className="size-5" />
              <span className="tabular-nums"><span className="font-semibold">{d.high != null ? `${d.high}°` : "—"}</span> <span className="text-muted-foreground">{d.low != null ? `${d.low}°` : ""}</span></span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The next 24 hours' temperature, as a filled line, every 3rd hour labelled. */
function HourLine({ hours }) {
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
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Next 24 hours: ${lo}° to ${hi}°`} data-weather-hours>
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
