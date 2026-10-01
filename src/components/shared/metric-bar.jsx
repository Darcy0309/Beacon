import CountUp from "@/components/shared/count-up";
import { cn } from "@/lib/utils";

/** Thin labelled progress bar: label left, value right, track beneath. The bar grows in and the value counts up. */
export default function MetricBar({ label, value, max = 100, color = "var(--primary)", className }) {
  const pct = Math.max(0, Math.min(100, (Number(value) / (max || 1)) * 100));
  return (
    <div data-list-row className={cn("-mx-2 rounded-md px-2 py-1.5", className)}>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="truncate text-foreground/80">{label}</span>
        <span className="shrink-0 font-semibold tabular-nums" style={{ color }}>
          <CountUp value={value} />
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className="animate-grow-width h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: color, boxShadow: `0 0 10px -2px ${color}` }}
        />
      </div>
    </div>
  );
}
