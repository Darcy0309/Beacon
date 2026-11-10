import CountUp from "@/components/shared/count-up";
import ReportChart from "@/components/shared/report-chart";
import EdgeTrace from "@/components/shared/edge-trace";
import { cn } from "@/lib/utils";

/**
 * Metric tile: accent edge, icon chip, wide-tracked label, large figure, and a
 * small chart at the foot in the tile's accent hue, its figures up the left.
 * `seriesLabels` name the series' points along the chart's foot ("Mon", "9", "8a"; client, Nov
 * 2026), `seriesTitles` in full for its tooltips ("Mon, Nov 9"), and `seriesCaption` says under
 * it what the bars are when the labels can't ("Leads in each project"). The figure
 * counts up and the chart rises from zero as the tile appears.
 * Pass `trace` to add the animated streak that laps the border. `action`
 * shares the note's line (a period switch); `children` after it.
 */
export default function StatTile({
  label,
  value,
  note,
  icon: Icon,
  accent = "var(--neon-cyan)",
  series,
  seriesLabels,
  seriesTitles,
  seriesCaption,
  bars = false,
  trace = false,
  action,
  children,
  className,
  style,
}) {
  return (
    <div
      data-panel
      data-accent-edge=""
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl transition-colors duration-200",
        className
      )}
      style={{ "--edge": accent, ...style }}
    >
      {/* accent wash from the top-right corner */}
      <div
        aria-hidden
        data-tile-wash
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background: `radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, ${accent} 16%, transparent), transparent 62%)`,
        }}
      />

      <div className="relative p-4">
        <div className="flex items-start gap-2.5">
          {Icon ? (
            <span
              data-tile-icon
              className="flex size-8 shrink-0 items-center justify-center rounded-md border"
              style={{
                borderColor: `color-mix(in srgb, ${accent} 35%, transparent)`,
                background: `color-mix(in srgb, ${accent} 12%, transparent)`,
                color: accent,
              }}
            >
              <Icon className="size-4" />
            </span>
          ) : null}
          {/* Tinted toward the tile's accent so the heading belongs to the
              tile rather than reading as navy inside a green or amber one. */}
          <span
            className="stat-label pt-0.5"
            style={{ color: `color-mix(in srgb, ${accent} 68%, var(--foreground))` }}
          >
            {label}
          </span>
        </div>

        <div className="mt-3 stat-value" data-tile-value style={{ color: accent }}>
          <CountUp value={value} />
        </div>
        {/* The action (a period switch) shares the note's line: tiles keep their figures level and stay short. */}
        {note || action ? (
          // With an action, one line of text high whatever the note says, so the switch never moves and the tile is no taller.
          <div className={cn("mt-1 flex items-center justify-between gap-2", action ? "h-4" : "flex-wrap")}>
            {note ? <div className={cn("min-w-0 text-xs text-muted-foreground", action && "truncate")}>{note}</div> : <span />}
            {action ? <span className="flex shrink-0">{action}</span> : null}
          </div>
        ) : null}
        {children}
      </div>

      {/* Pinned to the foot of the tile: tiles in a row stretch to the tallest,
          and a note that wraps must not push one chart lower than its neighbours.
          Its figures up the left and a bar/line/area menu in the corner (client, Nov 2026). */}
      {series?.length ? (
        <ReportChart
          id={`tile:${label}`}
          variant="tile"
          defaultType={bars ? "bar" : "area"}
          series={[{ key: "v", label, color: accent }]}
          points={series.map((v, i) => ({
            key: String(i),
            label: seriesLabels?.[i] ?? "",
            title: seriesTitles?.[i] ?? seriesLabels?.[i],
            values: { v: Number(v) || 0 },
          }))}
          caption={seriesCaption}
          height={seriesLabels?.length ? "h-24" : "h-20"}
          className="tile-spark mt-auto w-full shrink-0 px-3 pb-3"
          data-tile-chart=""
        />
      ) : null}

      {trace ? <EdgeTrace /> : null}
    </div>
  );
}
