"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "@/components/shared/intent-link";
import Calendar from "@/components/shared/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { monthStart } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { dashboardHref } from "@/features/dashboard/components/period-switch";

const step = "flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

/**
 * Which days a dashboard card shows: back and on a step (a day, a week, a
 * pay period, a month), the days in words, and a calendar to go straight to
 * any day; "Today" comes back. The day lives in the address (`dateParam`),
 * with the rest of `params` kept. `prev`/`next`: the day to go to, or null.
 */
export default function ViewNav({ params, dateParam, anchor, label, prev, next, today, showsToday, name }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => monthStart(anchor));
  const href = (day) => dashboardHref(params, { [dateParam]: day });

  return (
    <div className="flex items-center gap-0.5" data-view-nav={dateParam}>
      {prev ? (
        <Link href={href(prev)} scroll={false} className={step} aria-label={`Previous ${name}`} data-view-prev><ChevronLeft className="size-3.5" /></Link>
      ) : null}
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setMonth(monthStart(anchor)); }}>
        <PopoverTrigger asChild>
          <button type="button" className="flex h-6 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium tabular-nums transition-colors hover:bg-muted"
            aria-label={`Choose the ${name}: ${label}`} data-view-label>
            <CalendarDays className="size-3.5 text-primary" />
            {label}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto">
          <Calendar
            value={anchor}
            month={month}
            onMonthChange={setMonth}
            max={today}
            autoFocus
            onSelect={(day) => {
              setOpen(false);
              router.push(href(day), { scroll: false });
            }}
          />
        </PopoverContent>
      </Popover>
      <Link href={next ? href(next) : "#"} scroll={false} aria-disabled={!next} tabIndex={next ? undefined : -1}
        className={cn(step, !next && "pointer-events-none opacity-30")} aria-label={`Next ${name}`} data-view-next>
        <ChevronRight className="size-3.5" />
      </Link>
      {!showsToday ? (
        <Link href={href(today)} scroll={false} className="ml-1 rounded-md px-1.5 text-[0.6rem] font-semibold uppercase leading-6 tracking-[0.08em] text-primary transition-colors hover:bg-primary/10">
          Today
        </Link>
      ) : null}
    </div>
  );
}
