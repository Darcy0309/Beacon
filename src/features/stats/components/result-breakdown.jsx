import { PieChart } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";

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

/**
 * A project's names by call result, as a circle: a slice a result, sized by
 * its share of the project's names, the total in the middle; beside it each
 * result with its colour, how many names and what share, most first, and
 * the three kinds of result summed underneath. `rows`: getResultBreakdown().
 */
export default function ResultBreakdown({ rows, type, className, style }) {
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
            <svg viewBox="0 0 42 42" className="mx-auto block w-40 -rotate-90" role="img" data-result-chart
              aria-label={`Call results: ${slices.map((s) => `${s.result} ${s.names} (${share(s.share)})`).join(", ")}`}>
              <circle cx="21" cy="21" r={R} fill="none" stroke="var(--muted)" strokeWidth="5.5" />
              {slices.map((s) => (
                <circle key={s.result} cx="21" cy="21" r={R} fill="none" stroke={s.color} strokeWidth="5.5" data-slice={s.result}
                  // A hairline between slices; a sliver is still drawn wide enough to see.
                  strokeDasharray={`${Math.max(s.share - (slices.length > 1 ? 0.35 : 0), 0.25)} 100`} strokeDashoffset={-s.from}>
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
              <li key={s.result} data-result-row={s.result} className="flex items-center gap-2.5 text-sm">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
                <span className="min-w-0 flex-1 truncate" title={s.result}>{s.result}</span>
                <span className="shrink-0 tabular-nums">
                  <strong>{s.names.toLocaleString()}</strong> <span className="inline-block w-9 text-right text-xs text-muted-foreground">{share(s.share)}</span>
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
