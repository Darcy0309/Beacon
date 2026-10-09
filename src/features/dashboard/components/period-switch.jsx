import Link from "@/components/shared/intent-link";
import { TILE_PERIODS } from "@/lib/pay";
import { cn } from "@/lib/utils";

/** The dashboard's address with `changes` made, the rest of `params` kept. */
export function dashboardHref(params, changes) {
  const q = new URLSearchParams({ ...params, ...changes });
  return `/?${q.toString()}`;
}

/**
 * Pay period · Week · Month on a dashboard tile or card (`options`, from
 * lib/pay): which days it counts. A link each, so the choice lives in the
 * address (`param`) and the other tiles keep theirs (`params`).
 */
export default function PeriodSwitch({ param, current, params = {}, options = TILE_PERIODS }) {
  return (
    // No taller than the line of text it sits on, so the tile is as tall as every other.
    <span className="-my-0.5 inline-flex rounded-md border border-[var(--panel-border)] bg-background/40 p-px" data-period-switch={param}>
      {options.map(([key, label]) => (
        <Link
          key={key}
          href={dashboardHref(params, { [param]: key })}
          scroll={false}
          aria-current={current === key ? "true" : undefined}
          className={cn(
            "rounded px-1.5 text-[0.6rem] font-semibold uppercase leading-4 tracking-[0.08em] transition-colors",
            current === key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {key === "period" ? "Pay" : label}
        </Link>
      ))}
    </span>
  );
}
