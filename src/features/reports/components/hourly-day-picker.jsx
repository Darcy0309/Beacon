"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import DatePicker from "@/components/shared/date-picker";
import { useReportPending } from "@/components/layout/navigation-progress";

/**
 * Hourly Progress's day: picking one (or typing it) shows that day at once,
 * and the field always says the day shown, however it was reached (the
 * arrows, Today, or the address), so it and the page's title never differ.
 */
export default function HourlyDayPicker({ day, today }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  useReportPending(pending);

  const go = (iso) => {
    if (!iso || iso === day || iso > today) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("day", iso);
    startTransition(() => router.push(`${pathname}?${params}`, { scroll: false }));
  };

  // Keyed by the day, so a day reached any other way starts the field over at it.
  return (
    <div data-hourly-day={day}>
      <DatePicker key={day} name="day" defaultValue={day} max="today" aria-label="Day" className="w-44" onChange={go} />
    </div>
  );
}
