import Topbar from "@/components/layout/topbar";
import CalendarView from "@/features/appointments/components/calendar-view";
import { getCalendarMonth, getCalendarRange } from "@/features/appointments/queries";
import { addDays, addMonths, formatIso, formatRange, isIsoDate, makeIso, monthStart, weekdayOf } from "@/lib/dates";
import { getBusinessTimeZone, getBusinessToday } from "@/lib/server/business-day";
import Link from "@/components/shared/intent-link";
import { getCalendarScope } from "@/features/stats/queries";

export const dynamic = "force-dynamic";

const VIEWS = ["day", "week", "month"];

export default async function CalendarPage({ searchParams }) {
  const sp = await searchParams;
  // The business's today, not the server's: the server runs on UTC, where a
  // US evening is already tomorrow. Every date below is a "YYYY-MM-DD" string.
  const [today, timeZone] = await Promise.all([getBusinessToday(), getBusinessTimeZone()]);

  const view = VIEWS.includes(sp?.view) ? sp.view : "month";
  // ?d=YYYY-MM-DD anchors every view; ?m=YYYY-MM still works for month links.
  let anchor = isIsoDate(sp?.d) ? sp.d : null;
  if (!anchor && /^\d{4}-\d{2}$/.test(sp?.m ?? "")) {
    const [y, m] = sp.m.split("-").map(Number);
    anchor = makeIso(y, m, 1);
  }
  anchor ||= today;
  // ?a=<appointment id>: a notification's "Open calendar" — that one is highlighted.
  const focusId = /^\d{1,18}$/.test(sp?.a ?? "") ? Number(sp.a) : null;

  // ?client=<id> or ?project=<id>: that client's projects, or that project's calendar alone.
  const id = (v) => (/^[1-9]\d{0,17}$/.test(v ?? "") ? Number(v) : null);
  const scope = id(sp?.project) || id(sp?.client) ? await getCalendarScope({ projectId: id(sp?.project), clientId: id(sp?.project) ? null : id(sp?.client) }) : null;
  const only = scope ? (id(sp?.project) ? `project=${id(sp.project)}&` : `client=${id(sp.client)}&`) : "";
  const projectIds = scope?.ids ?? null;

  const href = (v, date) => `/calendar?${only}view=${v}&d=${date}`;
  const viewHrefs = Object.fromEntries(VIEWS.map((v) => [v, href(v, anchor)]));
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7)) - 1;

  let data, days, title, prev, next;

  if (view === "month") {
    data = await getCalendarMonth(year, month, projectIds);
    title = formatIso(anchor, "month");
    prev = href("month", addMonths(monthStart(anchor), -1));
    next = href("month", addMonths(monthStart(anchor), 1));
    days = null;
  } else {
    const span = view === "day" ? 1 : 7;
    // Weeks start on Sunday, matching the month grid's column order.
    const start = view === "day" ? anchor : addDays(anchor, -weekdayOf(anchor));
    const end = addDays(start, span - 1);
    data = await getCalendarRange(start, end, projectIds);

    days = Array.from({ length: span }, (_, i) => {
      const d = addDays(start, i);
      return {
        date: d,
        dow: formatIso(d, "weekday"),
        dayNum: Number(d.slice(8, 10)),
        isToday: d === today,
        href: href("day", d),
      };
    });

    title = view === "day" ? formatIso(anchor, "full") : formatRange(start, end);
    prev = href(view, addDays(start, -span));
    next = href(view, addDays(start, span));
  }

  return (
    <>
      <Topbar title="Calendar" sub={`${title} · ${data.count} appointment${data.count === 1 ? "" : "s"}`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        {scope ? (
          <div data-calendar-scope className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/8 px-4 py-2.5 text-sm">
            <span>
              Showing <strong>{scope.label}</strong>
              {scope.shared ? <span className="text-muted-foreground"> (the calendar {scope.shared} shares)</span> : null}
            </span>
            <Link href={`/calendar?view=${view}&d=${anchor}`} className="text-xs font-semibold uppercase tracking-[0.1em] text-primary hover:underline">Show every calendar</Link>
          </div>
        ) : null}
        <CalendarView
          view={view}
          title={title}
          count={data.count}
          rows={data.rows}
          byDate={data.byDate ?? null}
          byDay={data.byDay ?? null}
          days={days}
          year={year}
          month={month}
          today={today}
          timeZone={timeZone}
          todayDay={anchor.slice(0, 7) === today.slice(0, 7) ? Number(today.slice(8, 10)) : null}
          prev={prev}
          next={next}
          todayHref={href(view, today)}
          viewHrefs={viewHrefs}
          dayHrefBase={`/calendar?${only}view=day&d=`}
          focusId={focusId}
        />
      </div>
    </>
  );
}
