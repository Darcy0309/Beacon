"use client";

import { useState } from "react";
import { PieChart } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Still to call, a lead or an appointment, or resolved another way.
const KINDS = {
  viable: "Still to call",
  won: "Lead or appointment",
  resolved: "Resolved",
};
const share = (v) => (v > 0 && v < 1 ? "<1%" : `${Math.round(v)}%`);
// A colour a slice: hues a golden angle apart, so neighbours never look alike, readable on light and dark.
const colorOf = (i) => `hsl(${Math.round((190 + i * 137.5) % 360)} 72% 52%)`;
// A circle whose circumference is 100, so a slice's length is its percentage.
const R = 15.9155;
// How far a slice pointed at comes away from the circle, and how much wider it is drawn.
const PULL = 1.4;
const WIDTH = 5.5;
const WIDTH_ACTIVE = 7;
// Where a slice's middle points (the drawing's own x and y, before it is turned to start at 12 o'clock).
const outward = (s) => {
  const a = ((s.from + s.share / 2) / 100) * 2 * Math.PI;
  return `translate(${(Math.cos(a) * PULL).toFixed(3)}px, ${(Math.sin(a) * PULL).toFixed(3)}px)`;
};

/**
 * A project's names by call result, as a circle: a slice a result, sized by
 * its share of the project's names, the total in the middle; beside it each
 * result with its colour, how many names and what share, most first, and
 * the three kinds of result summed underneath. `rows`: getResultBreakdown().
 * A slice pointed at comes away from the circle and its line on the right
 * lights up; pointing at (or tabbing to) a line does the same the other way.
 */
export default function ResultBreakdown({ rows, type, className, style }) {
  const [active, setActive] = useState(null);
  const all = rows.reduce((sum, r) => sum + r.names, 0);
  let turned = 0;
  const slices = rows.map((r, i) => {
    const slice = { ...r, color: colorOf(i), from: turned };
    turned += r.share;
    return slice;
  });
  const kinds = Object.entries(KINDS).map(([key, label]) => ({ key, label, names: rows.filter((r) => r.kind === key).reduce((sum, r) => sum + r.names, 0) }));
  return (
    <Card data-result-breakdown className={className} style={style}>
      <SectionHeader wrap label={`${type === "APPT" ? "Appointment" : "DB Dev"} Call Results`} icon={PieChart}
        action={<span className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground">{all.toLocaleString()} names</span>} />
      {all ? (
        <div className="flex flex-col items-center gap-x-8 gap-y-5 p-5 sm:flex-row sm:items-center">
          <div className="w-52 shrink-0">
            <svg viewBox="0 0 42 42" className="mx-auto block w-40 -rotate-90 overflow-visible" role="img" data-result-chart
              aria-label={`Call results: ${slices.map((s) => `${s.result} ${s.names} (${share(s.share)})`).join(", ")}`}>
              <circle cx="21" cy="21" r={R} fill="none" stroke="var(--muted)" strokeWidth={WIDTH} />
              {slices.map((s) => (
                <circle key={s.result} cx="21" cy="21" r={R} fill="none" stroke={s.color} data-slice={s.result} data-active={active === s.result || undefined}
                  strokeWidth={active === s.result ? WIDTH_ACTIVE : WIDTH}
                  // A hairline between slices; a sliver is still drawn wide enough to see.
                  strokeDasharray={`${Math.max(s.share - (slices.length > 1 ? 0.35 : 0), 0.25)} 100`} strokeDashoffset={-s.from}
                  className="cursor-pointer motion-safe:transition-[transform,stroke-width,opacity] motion-safe:duration-200 motion-safe:ease-out"
                  style={{ transform: active === s.result ? outward(s) : "none", opacity: active && active !== s.result ? 0.35 : 1 }}
                  onMouseEnter={() => setActive(s.result)} onMouseLeave={() => setActive(null)}
                  onClick={() => setActive((a) => (a === s.result ? null : s.result))}>
                  <title>{`${s.result}: ${s.names.toLocaleString()} (${share(s.share)})`}</title>
                </circle>
              ))}
              <g className="rotate-90" style={{ transformOrigin: "21px 21px" }}>
                <text x="21" y="20.5" textAnchor="middle" className="fill-foreground font-bold" style={{ fontSize: "5.2px" }}>{all.toLocaleString()}</text>
                <text x="21" y="25" textAnchor="middle" className="fill-muted-foreground uppercase" style={{ fontSize: "2.1px", letterSpacing: "0.25px" }}>names</text>
              </g>
            </svg>
            <ul className="mt-3 space-y-0.5 text-xs text-muted-foreground">
              {kinds.map((k) => (
                <li key={k.key} className="flex justify-between gap-2 whitespace-nowrap" data-result-kind={k.key}>
                  <span>{k.label}</span>
                  <span className="tabular-nums"><strong className="text-foreground">{k.names.toLocaleString()}</strong> ({share((k.names / all) * 100)})</span>
                </li>
              ))}
            </ul>
          </div>
          <ul className="grid w-full min-w-0 flex-1 grid-cols-1 content-center gap-x-8 gap-y-1.5 min-[1100px]:grid-cols-2">
            {slices.map((s) => (
              <li key={s.result} data-result-row={s.result} data-active={active === s.result || undefined} tabIndex={0}
                onMouseEnter={() => setActive(s.result)} onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(s.result)} onBlur={() => setActive(null)}
                className={cn(
                  "-mx-2 flex cursor-default items-center gap-2.5 rounded-md px-2 py-0.5 text-sm outline-none motion-safe:transition-[background-color,opacity] motion-safe:duration-200",
                  active && active !== s.result && "opacity-45"
                )}
                style={active === s.result ? { background: `color-mix(in srgb, ${s.color} 16%, transparent)`, boxShadow: `inset 2px 0 0 ${s.color}` } : undefined}>
                <span className={cn("size-2.5 shrink-0 rounded-sm motion-safe:transition-transform motion-safe:duration-200", active === s.result && "scale-125")} style={{ background: s.color }} />
                <span className={cn("min-w-0 flex-1 truncate", active === s.result && "font-semibold")} title={s.result}>{s.result}</span>
                <span className="shrink-0 tabular-nums">
                  <strong>{s.names.toLocaleString()}</strong> <span className={cn("inline-block w-9 text-right text-xs", active === s.result ? "font-semibold text-foreground" : "text-muted-foreground")}>{share(s.share)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="p-6 text-sm text-muted-foreground">No names on this project yet.</p>
      )}
    </Card>
  );
}
