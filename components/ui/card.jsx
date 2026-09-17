import { cn } from "@/lib/utils";
import EdgeTrace from "@/components/edge-trace";

/**
 * Panel surface: hairline border, flat dark ground, optional bright accent edge
 * along the top (pass `accent` as any CSS colour, e.g. "var(--neon-amber)").
 * Add `trace` to animate a streak around the border (dashboard only).
 */
function Card({ className, accent, trace = false, style, children, ...props }) {
  return (
    <div
      data-card
      data-panel
      data-accent-edge={accent ? "" : undefined}
      className={cn(
        "relative overflow-hidden rounded-xl border text-card-foreground transition-colors duration-200",
        className
      )}
      style={accent ? { ...style, "--edge": accent } : style}
      {...props}
    >
      {children}
      {accent && trace ? <EdgeTrace /> : null}
    </div>
  );
}

function CardHeader({ className, ...props }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-b border-[var(--panel-border)] px-5 py-3.5",
        className
      )}
      {...props}
    />
  );
}

/** Section titles are tiny, bold and wide-tracked rather than headline-sized. */
function CardTitle({ className, ...props }) {
  return <div className={cn("eyebrow", className)} {...props} />;
}

function CardContent({ className, ...props }) {
  return <div className={cn("p-5", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardContent };
