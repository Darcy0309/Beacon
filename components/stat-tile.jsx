import Sparkline from "@/components/sparkline";
import EdgeTrace from "@/components/edge-trace";
import { cn } from "@/lib/utils";

/**
 * Metric tile: accent edge, icon chip, wide-tracked label, large figure, and a
 * sparkline bleeding to the bottom edge in the tile's accent hue.
 * Pass `trace` to add the animated streak that laps the border.
 */
export default function StatTile({
  label,
  value,
  note,
  icon: Icon,
  accent = "var(--neon-cyan)",
  series,
  bars = false,
  trace = false,
  className,
  style,
}) {
  return (
    <div
      data-panel
      data-accent-edge=""
      className={cn(
        "group relative overflow-hidden rounded-xl transition-colors duration-200",
        className
      )}
      style={{ "--edge": accent, ...style }}
    >
      {/* accent wash from the top-right corner */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background: `radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, ${accent} 16%, transparent), transparent 62%)`,
        }}
      />

      <div className="relative p-4">
        <div className="flex items-start gap-2.5">
          {Icon ? (
            <span
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

        <div className="mt-3 stat-value" style={{ color: accent }}>
          {value}
        </div>
        {note ? <div className="mt-1 text-xs text-muted-foreground">{note}</div> : null}
      </div>

      {series?.length ? (
        <Sparkline
          values={series}
          color={accent}
          bars={bars}
          className="block h-16 w-full"
        />
      ) : null}

      {trace ? <EdgeTrace /> : null}
    </div>
  );
}
