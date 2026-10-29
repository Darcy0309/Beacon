import { CalendarClock, CalendarCheck, Clock, CheckCheck } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import { leadHref, listAddress } from "@/lib/back-link";
import StatTile from "@/components/shared/stat-tile";
import SectionHeader from "@/components/shared/section-header";
import AppointmentForm from "@/features/appointments/components/appointment-form";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AWAITING, clientProjectIds, getAppointmentFilters, getClientAppointments, getWeekAppointments, listAppointments } from "@/features/appointments/queries";
import UpdateMessage from "@/features/appointments/components/update-message";
import { getSalesReps } from "@/features/users/queries";
import ClientAppointments from "@/features/appointments/components/client-appointments";
import { getCarrierNames } from "@/features/insurance/queries";
import { UPDATE_STATUSES } from "@/lib/appointment-updates";
import { getBusinessTimeZone, getBusinessToday } from "@/lib/server/business-day";
import { addDays, daysBetween, formatRange, fromIso, isIsoDate } from "@/lib/dates";
import Link from "@/components/shared/intent-link";
import ParamSelect from "@/components/shared/param-select";
import DateRangePicker from "@/components/shared/date-range-picker";
import { getCurrentUser } from "@/lib/server/session";
import { getLookups } from "@/lib/server/lookups";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  // Upcoming and not confirmed yet (Oct 2026): in the dashboard's yellow.
  [AWAITING]: "var(--event-waiting)",
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
function Appt({ a, href, staff = null }) {
  const tone = STATUS_TONE[a.status] ?? "var(--neon-cyan)";
  return (
    // The row opens the lead; beside it at the far right, a message to the manager who set it (Oct 2026: a question about it).
    <div className="flex items-center border-b border-[var(--panel-border)] last:border-0">
    <Link href={href} prefetch={false} data-list-row data-appt-row={a.id}
      className="grid min-w-0 flex-1 grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 pl-5 pr-3 transition-colors hover:bg-primary/5 lg:grid-cols-[4rem_minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1fr)_9.5rem_minmax(0,1fr)]">
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
    <div className="w-10 shrink-0 pr-3 text-right">
      {staff ? (
        <UpdateMessage about="appointment" staff={staff}
          update={{ id: a.id, leadId: a.leadId, co: a.co, client: a.client, managerId: a.managerId, manager: a.manager, statusText: a.status,
            summary: [`${a.longDay} · ${a.time} ${a.ampm}`, [a.client, a.project].filter((v) => v && v !== "—").join(" · "), a.agent !== "—" ? `Agent: ${a.agent}` : null].filter(Boolean).join("\n") }} />
      ) : null}
    </div>
    </div>
  );
}

const COLUMNS = ["Time", "Company", "Client", "Project", "Agent", "Status", "Set by", ""];

export default async function AppointmentsPage({ searchParams }) {
  const sp = await searchParams;
  // The list: the next 7 days to begin with, or the appointment days chosen (a year at most);
  // by client, project, the manager who set it and status. Read as soon as the day, who is asking
  // and the filters are known, alongside the week's appointments.
  const id = (v) => (typeof v === "string" && /^[1-9]\d{0,17}$/.test(v) ? v : "");
  const pick = ([today, me, filters]) => {
    // A client's list (Sean, Oct 2026): two months either side of today, to update the ones gone by.
    const client = me?.role === "client";
    let from = isIsoDate(sp?.from) ? sp.from : client ? addDays(today, -60) : today;
    let to = isIsoDate(sp?.to) ? sp.to : client ? addDays(today, 60) : addDays(from, 6);
    if (to < from) [from, to] = [to, from];
    if (daysBetween(from, to) > 366) to = addDays(from, 366);
    // A manager's list starts as their own (Oct 2026); "all" is everyone's.
    const manager = me?.role === "client" ? "" : sp?.manager === "all" ? "" : id(sp?.manager) || (me?.role === "manager" && sp?.manager === undefined ? String(me.id) : "");
    const chosen = {
      client: id(sp?.client), project: id(sp?.project), manager,
      // The client's Sales Rep (Oct 2026).
      rep: me?.role !== "client" ? id(sp?.rep) : "",
      status: filters.statuses.some((o) => o.value === sp?.status) ? sp.status : "",
      // A client's: how the appointments went (their Update Status).
      update: me?.role === "client" && UPDATE_STATUSES.some(([k]) => k === sp?.update_status) ? sp.update_status : "",
    };
    return { from, to, chosen };
  };
  const todayP = getBusinessToday();
  const meP = getCurrentUser();
  const filtersP = getAppointmentFilters();
  const listP = Promise.all([todayP, meP, filtersP]).then((got) => {
    const { from, to, chosen } = pick(got);
    // A client's list is their own (client_appointments(): with the manager, and each one's update).
    if (got[1]?.role === "client") {
      return getClientAppointments({ from, to, projectId: chosen.project || null, status: chosen.update || null })
        .then((clientRows) => ({ rows: [], capped: false, clientRows }));
    }
    return listAppointments({ from, to, clientId: chosen.client || null, projectId: chosen.project || null, userId: chosen.manager || null,
      status: chosen.status || null, repId: chosen.rep || null });
  });
  // The tiles follow the list's client, project, manager and Sales Rep (Oct 2026); not its days or status.
  const weekP = Promise.all([todayP, meP, filtersP]).then(async (got) => {
    const { chosen } = pick(got);
    if (got[1]?.role === "client") return getWeekAppointments();
    let projectIds = await clientProjectIds({ clientId: chosen.client || null, repId: chosen.rep || null });
    if (chosen.project) projectIds = (projectIds ?? [Number(chosen.project)]).filter((p) => p === Number(chosen.project));
    return getWeekAppointments({ projectIds, userId: chosen.manager || null });
  });
  const extrasP = meP.then((me) => (me?.role === "client" ? Promise.all([getCarrierNames(), getBusinessTimeZone()]) : [[], null]));
  const repsP = meP.then((me) => (me?.role === "client" ? [] : getSalesReps()));
  const [{ rows, groups }, options, today, me, filters, list, [carriers, tz], reps] = await Promise.all([weekP, getLookups(), todayP, meP, filtersP, listP, extrasP, repsP]);
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
  // Still waiting for the confirmation call (the calendar's yellow): their status now says so, not Scheduled.
  const awaiting = rows.filter((a) => a.waiting).length;
  // Who an appointment's message can go to: the staff, the one who set it first in the list.
  const messageTo = staff ? filters.managers.map((m) => ({ id: Number(m.value), name: m.label, role: { admin: "Administrator", manager: "Account Manager", agent: "Agent" }[m.role] ?? m.role })) : null;
  const narrowed = [chosen.rep ? `${reps.find((r) => String(r.id) === chosen.rep)?.name ?? "a Sales Rep"}'s clients` : null,
    chosen.manager ? `set by ${filters.managers.find((m) => m.value === chosen.manager)?.label ?? "one manager"}` : null].filter(Boolean).join(" · ");

  // Per-day counts for the sparklines.
  const perDay = groups.map(([, list]) => list.length);

  const tiles = [
    { label: "Next 7 Days", value: String(rows.length), note: narrowed ? `scheduled · ${narrowed}` : "appointments scheduled",
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
            label={custom || !staff ? "Appointments" : "The Next 7 Days"}
            icon={CalendarClock}
            // Staff book appointments by hand (one set by email or text, not from a call); the
            // client's people see theirs, set by us, and record how each went.
            action={staff ? (
              <AppointmentForm
                options={options}
                trigger={<Button size="sm"><CalendarClock /> New appointment</Button>}
              />
            ) : null}
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
            {staff ? <ParamSelect name="rep" label="Sales Rep" value={chosen.rep} options={reps.map((r) => ({ value: String(r.id), label: r.name }))} clears={["project"]} /> : null}
            {/* A manager starts on their own; Everyone is "all", so it isn't taken for the default. */}
            {staff ? <ParamSelect name="manager" label="Manager" placeholder={me?.role === "manager" ? null : "Everyone"}
              value={me?.role === "manager" && !chosen.manager ? "all" : chosen.manager}
              options={me?.role === "manager" ? [{ value: "all", label: "Everyone" }, ...filters.managers] : filters.managers} clears={[]} /> : null}
            {staff ? <ParamSelect name="status" label="Status" placeholder="Any status" value={chosen.status} options={filters.statuses} clears={[]} /> : (
              <ParamSelect name="update_status" label="Update status" placeholder="Any update" value={chosen.update}
                options={UPDATE_STATUSES.map(([value, label]) => ({ value, label }))} clears={["update"]} />
            )}
            {custom || Object.entries(chosen).some(([k, v]) => v && !(k === "manager" && me?.role === "manager" && v === String(me.id) && sp?.manager === undefined)) ? (
              <Link href="/appointments" className="text-xs font-semibold uppercase tracking-[0.1em] text-primary hover:underline" data-clear-filters>Clear</Link>
            ) : null}
            <span className="ml-auto text-xs tabular-nums text-muted-foreground" data-appointment-count>
              {(list.clientRows ?? list.rows).length.toLocaleString()} appointment{(list.clientRows ?? list.rows).length === 1 ? "" : "s"} · {formatRange(from, to)}
            </span>
          </div>
          {list.capped ? <p className="border-b border-[var(--panel-border)] px-5 py-2 text-xs text-muted-foreground">Showing the first 2,000: narrow the days or filters to see the rest.</p> : null}
          {list.clientRows ? (
            list.clientRows.length ? (
              <ClientAppointments rows={list.clientRows} carriers={carriers} today={today} timeZone={tz}
                openId={/^[1-9]\d{0,17}$/.test(sp?.update ?? "") ? Number(sp.update) : null} back={listAddress("/appointments", sp)} />
            ) : (
              <p className="p-8 text-center text-sm text-muted-foreground">No appointments match these filters.</p>
            )
          ) : null}
          {list.clientRows ? null : list.rows.length ? (
            <div className="hidden grid-cols-[4rem_minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1fr)_9.5rem_minmax(0,1fr)_1.5rem] gap-x-4 border-b border-[var(--panel-border)] py-2 pl-5 pr-3 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground lg:grid">
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
                <Appt key={a.id} a={{ ...a, longDay: label(a.date) }} staff={messageTo}
                  href={staff && a.leadId ? leadHref(a.leadId, listAddress("/appointments", sp)) : `/calendar?view=day&d=${a.date}&a=${a.id}`} />
              ))}
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}
