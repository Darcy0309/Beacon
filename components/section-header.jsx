import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The bar that opens every panel: an accent tick, a tiny wide-tracked label,
 * and an optional action on the right.
 */
export default function SectionHeader({ label, icon: Icon, action, href, className }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-[var(--panel-border)] px-5 py-3",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden className="h-3.5 w-[3px] rounded-full bg-primary" />
        {Icon ? <Icon className="size-3.5 shrink-0 text-primary" /> : null}
        <span className="eyebrow truncate">{label}</span>
      </div>
      {href ? (
        <Link
          href={href}
          className="flex shrink-0 items-center gap-1 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-primary transition-opacity hover:opacity-75"
        >
          {action ?? "View all"} <ArrowRight className="size-3" />
        </Link>
      ) : action ? (
        <div className="shrink-0">{action}</div>
      ) : null}
    </div>
  );
}
