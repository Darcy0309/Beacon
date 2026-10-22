import Topbar from "@/components/layout/topbar";
import CalendarView from "@/features/appointments/components/calendar-view";
import { getCalendarMonth, getCalendarRange } from "@/features/appointments/queries";
import { addDays, addMonths, formatIso, formatRange, isIsoDate, makeIso, monthEnd, monthGrid, monthStart, weekdayOf } from "@/lib/dates";
import { getBusinessTimeZone, getBusinessToday } from "@/lib/server/business-day";
import Link from "@/components/shared/intent-link";
import { getCalendarScope } from "@/features/stats/queries";
import ParamSelect from "@/components/shared/param-select";
import BlockedTime from "@/features/calendar/components/blocked-time";
import { dayMarks } from "@/lib/project-calendar";
import CalendarSync from "@/features/calendar/components/calendar-sync";
import { getBlocksAcross, getCalendarProjects, getMyCalendarFeed, getNotesAcross, getProjectCalendar } from "@/features/calendar/queries";
import { AddNoteButton } from "@/features/calendar/components/project-calendar";
import { getCurrentUser } from "@/lib/server/session";

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
  // Two rounds of queries, not one after another: which calendars (the scope asked for, the ones
  // they can open, who is asking), then everything shown on them at once.
  const [scope, calendars, me] = await Promise.all([
    id(sp?.project) || id(sp?.client) ? getCalendarScope({ projectId: id(sp?.project), clientId: id(sp?.project) ? null : id(sp?.client) }) : null,
    getCalendarProjects(),
    getCurrentUser(),
  ]);
  const only = scope ? (id(sp?.project) ? `project=${id(sp.project)}&` : `client=${id(sp.client)}&`) : "";
  const projectIds = scope?.ids ?? null;

  const href = (v, date) => `/calendar?${only}view=${v}&d=${date}`;

  // One project's calendar, with its blocked time, to look at and to block time out on: the one
  // chosen, or the only one there is (a client with a single project).
  const openId = id(sp?.project) ? projectIds?.[0] : calendars.length === 1 ? calendars[0].value : null;
  // Its blocked time: what is still to come (for the toolbar) and the month on show (shaded below).
  const shown = { from: anchor < today ? monthStart(anchor) : today, to: monthEnd(addMonths(monthStart(anchor > today ? anchor : today), 3)) };
  // Several calendars together (a client's projects; for a client, every one of their own): the
  // time blocked out on any of them shows too, each block with its project.
  const togetherIds = openId ? null : scope ? projectIds : me?.role === "client" ? calendars.map((c) => c.value) : null;
  // The days on show: a month, or a week or a day (weeks start on Sunday, matching the month grid's columns).
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7)) - 1;
  const rangeStart = view === "day" ? anchor : addDays(anchor, -weekdayOf(anchor));
  const rangeEnd = addDays(rangeStart, (view === "day" ? 1 : 7) - 1);
  const [projectCalendar, myFeed, together, shownData, notesTogether] = await Promise.all([
    openId ? getProjectCalendar({ projectId: openId, from: monthGrid(shown.from)[0], to: shown.to }) : null,
    openId ? getMyCalendarFeed(openId) : null,
    togetherIds?.length ? getBlocksAcross({ projectIds: togetherIds, from: monthGrid(shown.from)[0], to: shown.to }) : null,
    view === "month" ? getCalendarMonth(year, month, projectIds) : getCalendarRange(rangeStart, rangeEnd, projectIds),
    // Notes on the times of several calendars shown together, as their blocked time.
    togetherIds?.length ? getNotesAcross({ projectIds: togetherIds, from: monthGrid(shown.from)[0], to: shown.to }) : null,
  ]);
  const notes = projectCalendar?.notes ?? notesTogether;
  const blocks = projectCalendar?.blocks ?? together;
  const upcoming = (blocks ?? []).filter((b) => b.endsOn >= today).sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const blockedDays = blocks
    ? Object.fromEntries(Object.entries(dayMarks({ blocks }, monthGrid(shown.from)[0], shown.to)).map(([d, m]) => [d, m.blocked]))
    : null;
  const viewHrefs = Object.fromEntries(VIEWS.map((v) => [v, href(v, anchor)]));

  let data, days, title, prev, next;

  if (view === "month") {
    data = shownData;
    title = formatIso(anchor, "month");
    prev = href("month", addMonths(monthStart(anchor), -1));
    next = href("month", addMonths(monthStart(anchor), 1));
    days = null;
  } else {
    const span = view === "day" ? 1 : 7;
    const start = rangeStart;
    const end = rangeEnd;
    data = shownData;

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
        {/* One line: whose calendar this is, its blocked time still to come, and blocking out more. */}
        {calendars.length || scope ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[var(--panel-border)] bg-card/60 px-4 py-2.5" data-calendar-picker>
            {calendars.length ? (
              <ParamSelect name="project" label="Project calendar" placeholder="Every calendar" value={id(sp?.project) ? String(openId ?? "") : ""} options={calendars} clears={["client", "a"]} />
            ) : null}
            {scope && !id(sp?.project) ? (
              <span className="flex items-center gap-3 text-sm" data-calendar-scope>
                <span>Showing <strong>{scope.label}</strong></span>
                <Link href={`/calendar?view=${view}&d=${anchor}`} className="text-xs font-semibold uppercase tracking-[0.1em] text-primary hover:underline">Show every calendar</Link>
              </span>
            ) : null}
            {scope?.shared ? <span className="text-xs text-muted-foreground" data-calendar-scope>Shared with {scope.shared}</span> : null}
            {projectCalendar ? (
              <BlockedTime projectId={projectCalendar.projectId} blocks={upcoming} today={today}>
                <AddNoteButton projectId={projectCalendar.projectId} day={anchor < today ? today : anchor} />
                <CalendarSync projectId={projectCalendar.projectId} feed={myFeed} />
              </BlockedTime>
            ) : together ? (
              <BlockedTime blocks={upcoming} today={today} />
            ) : calendars.length ? (
              <span className="text-xs text-muted-foreground">Choose a project to see and block out time on its calendar.</span>
            ) : null}
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
          blockedDays={blockedDays}
          blocks={blocks}
          notes={notes}
        />
      </div>
    </>
  );
}
