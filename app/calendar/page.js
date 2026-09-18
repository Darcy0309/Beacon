import Topbar from "@/components/topbar";
import CalendarView from "@/components/calendar-view";
import { getCalendarMonth } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }) {
  const sp = await searchParams;
  const now = new Date();

  // ?m=YYYY-MM moves between months.
  const parsed = /^\d{4}-\d{2}$/.test(sp?.m ?? "") ? sp.m.split("-").map(Number) : null;
  const year = parsed ? parsed[0] : now.getFullYear();
  const month = parsed ? parsed[1] - 1 : now.getMonth();

  const { rows, byDay, count } = await getCalendarMonth(year, month);

  const isCurrent = year === now.getFullYear() && month === now.getMonth();
  const TODAY = isCurrent ? now.getDate() : null;

  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const key = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;
  const prev = month === 0 ? key(year - 1, 11) : key(year, month - 1);
  const next = month === 11 ? key(year + 1, 0) : key(year, month + 1);

  return (
    <>
      <Topbar title="Calendar" sub={`${monthLabel} · ${count} appointments`} />
      <div className="flex-1 p-4 sm:p-6">
        <CalendarView
          year={year}
          month={month}
          rows={rows}
          byDay={byDay}
          count={count}
          today={TODAY}
          prev={prev}
          next={next}
          monthLabel={monthLabel}
        />
      </div>
    </>
  );
}
