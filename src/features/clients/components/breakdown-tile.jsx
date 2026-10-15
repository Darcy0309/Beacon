import { cn } from "@/lib/utils";
import CountUp from "@/components/shared/count-up";

/**
 * A tile that counts the same things two ways, side by side: the active
 * clients by time zone and by agency group. `groups`: [{ title, rows:
 * [{ label, count }] }], each list with the most first. The two lists sit
 * side by side when the tile is wide enough for them, one over the other
 * when it is not (a tile's width changes in an .expand-row).
 */
export default function BreakdownTile({ label, icon, accent = "var(--neon-violet)", groups, className, style }) {
  return (
    <div data-panel data-accent-edge="" data-breakdown-tile
      className={cn("group @container relative flex flex-col overflow-hidden rounded-xl", className)}
      style={{ "--edge": accent, ...style }}>
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70"
        style={{ background: `radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, ${accent} 16%, transparent), transparent 62%)` }} />
      <div className="relative flex flex-1 flex-col p-4">
        <div className="flex items-start gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border"
            style={{ borderColor: `color-mix(in srgb, ${accent} 35%, transparent)`, background: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent }}>
            {icon}
          </span>
          <span className="stat-label min-w-0 flex-1 pt-0.5" style={{ color: `color-mix(in srgb, ${accent} 68%, var(--foreground))` }}>{label}</span>
        </div>
        <div className="mt-3 grid flex-1 grid-cols-1 content-start gap-x-4 gap-y-3 @[19rem]:grid-cols-2">
          {groups.map((g) => (
            <div key={g.title} className="min-w-0" data-breakdown={g.title}>
              <div className="eyebrow mb-1.5">{g.title}</div>
              {g.rows.length === 0 ? <p className="text-xs text-muted-foreground">None yet.</p> : (
                <ul className="max-h-24 space-y-1 overflow-y-auto pr-1 text-sm @[19rem]:max-h-44">
                  {g.rows.map((r) => (
                    <li key={r.label} className="flex items-baseline justify-between gap-2">
                      <span className={cn("min-w-0 truncate", r.none && "text-muted-foreground")} title={r.label}>{r.label}</span>
                      <strong className="shrink-0 tabular-nums" style={{ color: accent }}><CountUp value={r.count.toLocaleString()} /></strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
