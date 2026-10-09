import Link from "@/components/shared/intent-link";
import { TILE_PERIODS } from "@/lib/pay";
import { cn } from "@/lib/utils";

/**
 * Pay period · Week · Month on a dashboard tile: which days it counts. A
 * link each, so the choice lives in the address (`param`) and the other
 * tiles keep theirs (`params`).
 */
export default function PeriodSwitch({ param, current, params = {} }) {
  const href = (key) => {
    const q = new URLSearchParams({ ...params, [param]: key });
    return `/?${q.toString()}`;
  };
  return (
    <span className="inline-flex rounded-md border border-[var(--panel-border)] bg-background/40 p-0.5" data-period-switch={param}>
      {TILE_PERIODS.map(([key, label]) => (
        <Link
          key={key}
          href={href(key)}
          scroll={false}
          aria-current={current === key ? "true" : undefined}
          className={cn(
            "rounded px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.08em] transition-colors",
            current === key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {key === "period" ? "Pay" : label}
        </Link>
      ))}
    </span>
  );
}
