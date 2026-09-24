import Topbar from "@/components/topbar";
import CalendarView from "@/components/calendar-view";
import { getCalendarMonth, getCalendarRange } from "@/lib/queries";

export const dynamic = "force-dynamic";

const VIEWS = ["day", "week", "month"];

/** Local-time YYYY-MM-DD — never toISOString(), which shifts to UTC. */
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s) => new Date(`${s}T00:00:00`);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth() + n, 1); return x; };
/** Sunday of the week containing d, matching the month grid's column order. */
const weekStart = (d) => addDays(d, -d.getDay());

export default async function CalendarPage({ searchParams }) {
  const sp = await searchParams;
  const now = new Date();
  const today = iso(now);

  const view = VIEWS.includes(sp?.view) ? sp.view : "month";
  // ?d=YYYY-MM-DD anchors every view; ?m=YYYY-MM still works for month links.
  let anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp?.d ?? "") ? parse(sp.d) : null;
  if (!anchor && /^\d{4}-\d{2}$/.test(sp?.m ?? "")) {
    const [y, m] = sp.m.split("-").map(Number);
    anchor = new Date(y, m - 1, 1);
  }
  if (!anchor || Number.isNaN(anchor.getTime())) anchor = now;

  const href = (v, date) => `/calendar?view=${v}&d=${iso(date)}`;
  const viewHrefs = Object.fromEntries(VIEWS.map((v) => [v, href(v, anchor)]));

  let data, days, title, prev, next;

  if (view === "month") {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    data = await getCalendarMonth(year, month);
    title = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    prev = href("month", addMonths(anchor, -1));
    next = href("month", addMonths(anchor, 1));
    days = null;
  } else {
    const span = view === "day" ? 1 : 7;
    const start = view === "day" ? anchor : weekStart(anchor);
    const end = addDays(start, span - 1);
    data = await getCalendarRange(iso(start), iso(end));

    days = Array.from({ length: span }, (_, i) => {
      const d = addDays(start, i);
      return {
        date: iso(d),
        dow: d.toLocaleDateString("en-US", { weekday: "short" }),
        dayNum: d.getDate(),
        isToday: iso(d) === today,
        href: href("day", d),
      };
    });

    title =
      view === "day"
        ? anchor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
        : `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    prev = href(view, addDays(start, -span));
    next = href(view, addDays(start, span));
  }

  return (
    <>
      <Topbar title="Calendar" sub={`${title} · ${data.count} appointment${data.count === 1 ? "" : "s"}`} />
      <div className="flex-1 p-4 sm:p-6">
        <CalendarView
          view={view}
          title={title}
          count={data.count}
          rows={data.rows}
          byDate={data.byDate ?? null}
          byDay={data.byDay ?? null}
          days={days}
          year={anchor.getFullYear()}
          month={anchor.getMonth()}
          today={today}
          todayDay={
            anchor.getFullYear() === now.getFullYear() && anchor.getMonth() === now.getMonth()
              ? now.getDate()
              : null
          }
          prev={prev}
          next={next}
          todayHref={href(view, now)}
          viewHrefs={viewHrefs}
          dayHrefBase={`/calendar?view=day&d=`}
        />
      </div>
    </>
  );
}
