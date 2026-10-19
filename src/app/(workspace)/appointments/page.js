import { CalendarClock, CalendarCheck, Clock, CheckCheck } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import { leadHref, listAddress } from "@/lib/back-link";
import StatTile from "@/components/shared/stat-tile";
import SectionHeader from "@/components/shared/section-header";
import AppointmentForm from "@/features/appointments/components/appointment-form";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAppointmentFilters, getWeekAppointments, listAppointments } from "@/features/appointments/queries";
import { addDays, daysBetween, formatRange, fromIso, isIsoDate } from "@/lib/dates";
import Link from "@/components/shared/intent-link";
import ParamSelect from "@/components/shared/param-select";
import DateRangePicker from "@/components/shared/date-range-picker";
import { getCurrentUser } from "@/lib/server/session";
import { getBusinessToday } from "@/lib/server/business-day";
import { getLookups } from "@/lib/server/lookups";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  Scheduled: "var(--neon-cyan)",
  Confirmed: "var(--neon-emerald)",
  Held: "var(--neon-violet)",
  Rescheduled: "var(--neon-amber)",
  Cancelled: "var(--neon-rose)",
  "No Show": "var(--muted-foreground)",
  Invalid: "var(--neon-rose)",
};

// One appointment in the list, all in one row: when, the company (and its contact), the client,
// project and agent, its status, and the manager who set it at the far right. It opens the lead
// (for a client, who has no lead pages, the appointment on their calendar).
function Appt({ a, href }) {
  const tone = STATUS_TONE[a.status] ?? "var(--neon-cyan)";
  return (
    <Link href={href} prefetch={false} data-list-row data-appt-row={a.id}
      className="grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-[var(--panel-border)] px-5 py-3 transition-colors last:border-0 hover:bg-primary/5 lg:grid-cols-[4rem_minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1fr)_7.5rem_minmax(0,1fr)]">
      <div className="text-sm font-bold tabular-nums">
        {a.time}
        <span className="block text-[0.58rem] font-semibold tracking-[0.1em] text-muted-foreground">{a.ampm}</span>
      </div>
      <div className="min-w-0">
        <div className="truncate font-medium">{a.co}</div>
        <div className="truncate text-xs text-muted-foreground">{[a.contact, a.location, `${a.duration} min`].filter(Boolean).join(" · ")}</div>
        {/* On a narrower screen the rest goes under the company. */}
        <div className="truncate text-xs text-muted-foreground lg:hidden">{[a.client, a.project, a.agent !== "—" ? `Agent: ${a.agent}` : null, `Set by ${a.manager}`].filter(Boolean).join(" · ")}</div>
      </div>
      <div className="hidden min-w-0 truncate text-sm lg:block" title={a.client} data-col="client">{a.client}</div>
      <div className="hidden min-w-0 truncate text-sm text-muted-foreground lg:block" title={a.project} data-col="project">{a.project}</div>
      <div className="hidden min-w-0 truncate text-sm lg:block" title={a.agent} data-col="agent">{a.agent}</div>
      <div className="flex justify-end lg:justify-center" data-col="status">
        <span className="inline-flex rounded-full border px-2.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.12em]"
          style={{ borderColor: `color-mix(in srgb, ${tone} 45%, transparent)`, background: `color-mix(in srgb, ${tone} 8%, transparent)`, color: tone }}>
          {a.status}
        </span>
      </div>
      <div className="hidden min-w-0 truncate text-right text-sm text-muted-foreground lg:block" title={a.manager} data-col="manager">{a.manager}</div>
    </Link>
  );
}

const COLUMNS = ["Time", "Company", "Client", "Project", "Agent", "Status", "Set by"];

export default async function AppointmentsPage({ searchParams }) {
  const sp = await searchParams;
  // The list: the next 7 days to begin with, or the appointment days chosen (a year at most);
  // by client, project, the manager who set it and status. Read as soon as the day, who is asking
  // and the filters are known, alongside the week's appointments.
  const id = (v) => (typeof v === "string" && /^[1-9]\d{0,17}$/.test(v) ? v : "");
  const pick = ([today, me, filters]) => {
    let from = isIsoDate(sp?.from) ? sp.from : today;
    let to = isIsoDate(sp?.to) ? sp.to : addDays(from, 6);
    if (to < from) [from, to] = [to, from];
    if (daysBetween(from, to) > 366) to = addDays(from, 366);
    const chosen = {
      client: id(sp?.client), project: id(sp?.project), manager: me?.role !== "client" ? id(sp?.manager) : "",
      status: filters.statuses.some((o) => o.value === sp?.status) ? sp.status : "",
    };
    return { from, to, chosen };
  };
  const todayP = getBusinessToday();
  const meP = getCurrentUser();
  const filtersP = getAppointmentFilters();
  const listP = Promise.all([todayP, meP, filtersP]).then((got) => {
    const { from, to, chosen } = pick(got);
    return listAppointments({ from, to, clientId: chosen.client || null, projectId: chosen.project || null, userId: chosen.manager || null, status: chosen.status || null });
  });
  const [{ rows, groups }, options, today, me, filters, list] = await Promise.all([getWeekAppointments(), getLookups(), todayP, meP, filtersP, listP]);
  const staff = me?.role !== "client";
  const { from, to, chosen } = pick([today, me, filters]);
  const custom = isIsoDate(sp?.from) || isIsoDate(sp?.to);
  const days = [];
  for (const a of list.rows) {
    const last = days[days.length - 1];
    if (last && last[0] === a.date) last[1].push(a);
    else days.push([a.date, [a]]);
  }
  const projectOptions = chosen.client ? filters.projects.filter((p) => String(p.clientId) === chosen.client) : filters.projects;
  const kept = Object.entries(sp ?? {}).filter(([k, v]) => !["from", "to"].includes(k) && typeof v === "string");

  const todayCount = rows.filter((a) => a.date === today).length;
  const confirmed = rows.filter((a) => a.status === "Confirmed").length;
  const awaiting = rows.filter((a) => a.status === "Scheduled").length;

  // Per-day counts for the sparklines.
  const perDay = groups.map(([, list]) => list.length);

  const tiles = [
    { label: "Next 7 Days", value: String(rows.length), note: "appointments scheduled",
      icon: CalendarClock, accent: "var(--neon-cyan)", series: perDay, bars: true },
    { label: "Today", value: String(todayCount), note: "on the calendar",
      icon: Clock, accent: "var(--neon-amber)", series: perDay },
    { label: "Confirmed", value: String(confirmed), note: "ready to run",
      icon: CheckCheck, accent: "var(--neon-emerald)", series: perDay },
    { label: "Awaiting Confirmation", value: String(awaiting), note: "need a follow-up call",
      icon: CalendarCheck, accent: "var(--neon-violet)", series: perDay, bars: true },
  ];

  // "Today" and "Tomorrow" where the business is, not on the server's UTC clock.
  const label = (iso) => {
    const prefix = iso === today ? "Today — " : iso === addDays(today, 1) ? "Tomorrow — " : "";
    return prefix + fromIso(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
  };

  return (
    <>
      <Topbar title="Appointments" sub={`${rows.length} appointment${rows.length === 1 ? "" : "s"} in the next 7 days`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="expand-row grid grid-cols-1 gap-4 sm:grid-cols-2 xl:flex" data-from="xl">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        <Card data-appointment-list>
          <SectionHeader
            label={custom ? "Appointments" : "The Next 7 Days"}
            icon={CalendarClock}
            action={
              <AppointmentForm
                options={options}
                trigger={<Button size="sm"><CalendarClock /> New appointment</Button>}
              />
            }
          />
          {/* Filters: the appointment days, then client, project, who set it and status. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--panel-border)] px-5 py-3" data-appointment-filters>
            <form action="/appointments" className="inline-flex items-center gap-2">
              {kept.map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <span className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Appt date</span>
              <DateRangePicker key={`${from}:${to}`} defaultFrom={from} defaultTo={to} active={custom} />
            </form>
            {staff ? <ParamSelect name="client" label="Client" placeholder="All clients" value={chosen.client} options={filters.clients} clears={["project"]} /> : null}
            <ParamSelect name="project" label="Project" placeholder="All projects" value={chosen.project} options={projectOptions} clears={[]} />
            {staff ? <ParamSelect name="manager" label="Manager" placeholder="Everyone" value={chosen.manager} options={filters.managers} clears={[]} /> : null}
            <ParamSelect name="status" label="Status" placeholder="Any status" value={chosen.status} options={filters.statuses} clears={[]} />
            {custom || Object.values(chosen).some(Boolean) ? (
              <Link href="/appointments" className="text-xs font-semibold uppercase tracking-[0.1em] text-primary hover:underline" data-clear-filters>Clear</Link>
            ) : null}
            <span className="ml-auto text-xs tabular-nums text-muted-foreground" data-appointment-count>
              {list.rows.length.toLocaleString()} appointment{list.rows.length === 1 ? "" : "s"} · {formatRange(from, to)}
            </span>
          </div>
          {list.capped ? <p className="border-b border-[var(--panel-border)] px-5 py-2 text-xs text-muted-foreground">Showing the first 2,000: narrow the days or filters to see the rest.</p> : null}
          {list.rows.length ? (
            <div className="hidden grid-cols-[4rem_minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1fr)_7.5rem_minmax(0,1fr)] gap-x-4 border-b border-[var(--panel-border)] px-5 py-2 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground lg:grid">
              {COLUMNS.map((c) => <span key={c} className={c === "Status" ? "text-center" : c === "Set by" ? "text-right" : undefined}>{c}</span>)}
            </div>
          ) : (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {custom || Object.values(chosen).some(Boolean) ? "No appointments match these filters." : "No appointments scheduled in the next 7 days."}
            </p>
          )}
          {days.map(([date, dayRows]) => (
            <div key={date}>
              <div className="border-b border-[var(--panel-border)] bg-secondary/40 px-5 py-2">
                <span className="eyebrow">{label(date)}</span>
                <span className="ml-2 text-[0.66rem] font-semibold tabular-nums text-primary">{dayRows.length}</span>
              </div>
              {dayRows.map((a) => (
                <Appt key={a.id} a={a} href={staff && a.leadId ? leadHref(a.leadId, listAddress("/appointments", sp)) : `/calendar?view=day&d=${a.date}&a=${a.id}`} />
              ))}
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}
