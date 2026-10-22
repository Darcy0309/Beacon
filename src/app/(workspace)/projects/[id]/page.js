import Link from "@/components/shared/intent-link";
import { notFound } from "next/navigation";
import { ArrowLeft, Target, CalendarCheck, ListChecks, PhoneCall, CalendarSearch, ArrowRight, Percent, Download, ClipboardList, Pencil, Send } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import ToneBadge from "@/components/shared/tone-badge";
import ResultBadge from "@/components/shared/result-badge";
import { getCallResults } from "@/features/work/queries";
import StatTile from "@/components/shared/stat-tile";
import SectionHeader from "@/components/shared/section-header";
import FilterTable from "@/components/shared/filter-table";
import ProjectForm from "@/features/projects/components/project-form";
import ProjectRatesForm from "@/features/projects/components/project-rates-form";
import ProjectTeam from "@/features/projects/components/project-team";
import ProjectGoals from "@/features/projects/components/project-goals";
import { projectDays, projectGoals } from "@/lib/project-goals";
import XdateMonths from "@/features/reports/components/xdate-months";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ProjectInfoView from "@/features/project-info/components/project-info-view";
import { ProjectInfoDialog } from "@/features/project-info/components/project-info-form";
import InfoLinkDialog from "@/features/project-info/components/info-link-dialog";
import OwnInfoSwitch from "@/features/project-info/components/own-info-switch";
import { getProjectInfo } from "@/features/project-info/queries";
import { getCarrierNames } from "@/features/insurance/queries";
import { TableCell, TableRow } from "@/components/ui/table";
import { clientSlug } from "@/lib/format";
import { pageInfo, readListParams } from "@/lib/paging";
import { listLeads } from "@/features/leads/queries";
import { getProject, getProjectMonthCounts, getProjectOverview, getProjectTeam, getOfficeOptions } from "@/features/projects/queries";
import { getXdatesByMonth } from "@/features/reports/queries";
import { getAssignableStaff } from "@/features/users/queries";
import { getLookups } from "@/lib/server/lookups";
import { getBusinessToday } from "@/lib/server/business-day";
import { getPayRules } from "@/features/pay/queries";
import { getAppointmentDays, getBlockedDays, getCalendarScope, getLeadStats, getResultBreakdown } from "@/features/stats/queries";
import CalendarTile from "@/features/stats/components/calendar-tile";
import ConversionLines from "@/features/stats/components/conversion-lines";
import ResultBreakdown from "@/features/stats/components/result-breakdown";
import { addMonths, monthEnd, monthStart } from "@/lib/dates";
import { pctLabel } from "@/lib/lead-stats";
import { getCurrentUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const typeTone = { DBDV: "cyan", APPT: "violet" };
const statusTone = { Active: "emerald", Paused: "amber", Draft: "slate", Completed: "sky" };
const usd = (n) => Number(n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * One project, as an administrator or account manager watches it: true
 * totals across all of its names, who works it and how much each has left
 * and has done, when its names renew, and every lead on it, a page at a time.
 */
export default async function ProjectDetail({ params, searchParams }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,17}$/.test(id)) notFound();
  const sp = await searchParams;
  const list = readListParams(sp, ["result", "rep"]);
  if (list.filters.result && !/^[1-9]\d{0,17}$/.test(list.filters.result)) delete list.filters.result;
  // Everything at once: what needs only the project's id, and (as soon as the person and the day
  // are known) what depends on them, rather than one round of queries after another.
  const pid = Number(id);
  const meP = getCurrentUser();
  const todayP = getBusinessToday();
  const role = (me) => ({ admin: me?.role === "admin", canManage: me?.role === "admin" || me?.role === "manager", client: me?.role === "client" });
  // The months its calendar shows: the one before this, this, and the three after.
  const span = (today) => ({ first: addMonths(monthStart(today), -1), last: monthEnd(addMonths(monthStart(today), 3)) });
  // Counted by call result, as on the client's page; and the project's calendar (a DB dev
  // project shares the one of the appointment project it promotes to).
  const scopeP = getCalendarScope({ projectId: pid });
  const daysP = Promise.all([scopeP, todayP]).then(([scope, today]) => Promise.all([
    getAppointmentDays({ projectIds: scope?.ids ?? [pid], from: span(today).first, to: span(today).last }),
    getBlockedDays({ projectIds: scope?.ids ?? [pid], from: span(today).first, to: span(today).last }),
  ]));

  const [me, p, overview, team, leads, options, staff, xdates, today, payRules, callResults, info, carriers, { total: s }, results, scope, [days, blocked], monthCounts] = await Promise.all([
    meP,
    getProject(id),
    getProjectOverview(id),
    getProjectTeam(id),
    listLeads(list, { projectId: id }),
    getLookups().then(async (l) => ({ ...l, ...(await getOfficeOptions()) })),
    meP.then((me) => (role(me).canManage ? getAssignableStaff() : [])),
    getXdatesByMonth({ projectId: pid }),
    todayP,
    meP.then((me) => (role(me).admin ? getPayRules() : null)),
    getCallResults(),
    getProjectInfo(id),
    meP.then((me) => (role(me).admin ? getCarrierNames() : [])),
    getLeadStats({ projectId: pid }),
    getResultBreakdown(pid),
    scopeP,
    daysP,
    // This month's, for a goal a month (managers and administrators read it).
    meP.then((me) => (role(me).canManage ? getProjectMonthCounts([pid]) : {})),
  ]);
  if (!p) notFound();
  // A client's people (Sean, Oct 2026): their own project (Row Level Security), without its description (our billing
  // notes), pay, Edit, its reps or the Assigned filter.
  const { admin, canManage, client } = role(me);
  const calendar = span(today);
  const dbdev = p.type === "DBDV";

  const raw = p.raw ?? {};
  const apptProject = raw.appt_project_id ? options.projects.find((x) => x.id === raw.appt_project_id) : null;
  const canOpenLists = admin || team.some((r) => r.id === me?.id);
  const byMonth = (key) => xdates.months.map((m) => m[key]);

  // Who works it is ours: a client's people are not told of reps.
  const waiting = client ? null : overview.unassigned ? `${overview.unassigned.toLocaleString()} waiting for a rep` : `across ${team.length} rep${team.length === 1 ? "" : "s"}`;
  const tiles = [
    // DB dev only: an appointment project's names are leads, counted in the next tile.
    ...(dbdev ? [{ label: "Names Left to Call", value: s.namesLeft.toLocaleString(),
      note: [`of ${s.names.toLocaleString()} names`, overview.pending ? `${overview.pending.toLocaleString()} pending` : null, waiting].filter(Boolean).join(" · "),
      icon: ListChecks, accent: "var(--neon-cyan)", series: byMonth("viable") }] : []),
    { label: "Leads", value: s.leads.toLocaleString(),
      note: `${s.leadsActive.toLocaleString()} active · ${s.leadsResolved.toLocaleString()} resolved${dbdev || !waiting ? "" : ` · ${waiting}`}`,
      icon: Target, accent: "var(--neon-emerald)", series: byMonth("total"), bars: true },
    { label: "Appointments", value: s.appointments.toLocaleString(),
      note: `${s.invalid.toLocaleString()} invalid · ${overview.apptsMonth} this month${client ? "" : ` · ${overview.qaPending} in QA`}`,
      icon: CalendarCheck, accent: "var(--neon-violet)", series: byMonth("appointment"), bars: true },
    dbdev
      ? { label: "Conversions", value: pctLabel(s.leadRate), note: "of names became leads",
          icon: Percent, accent: "var(--neon-magenta)", children: <ConversionLines s={s} /> }
      : { label: "Conversions", value: pctLabel(s.apptRate === null && s.leads ? Math.round((s.appointmentsSet / s.leads) * 100) : s.apptRate), note: "of leads became appointments",
          icon: Percent, accent: "var(--neon-magenta)",
          children: (
            <div className="mt-2 text-xs tabular-nums text-muted-foreground" data-conversions>
              {s.leads.toLocaleString()} leads · {s.developed.toLocaleString()} from DB dev · {s.appointmentsSet.toLocaleString()} appointments
            </div>
          ) },
    { label: "Calls This Month", value: overview.callsMonth.toLocaleString(), note: `${overview.callsToday} today · last ${overview.lastWorked.toLowerCase()}`,
      icon: PhoneCall, accent: "var(--neon-amber)", series: overview.calls14d, bars: true },
  ];

  // Its goals for its dates: leads developed and appointments set, against what it has done (lead_stats()).
  const goalDays = projectDays({ start: raw.start_date, end: raw.end_date, today });
  const { leads: leadGoal, appts: apptGoal } = projectGoals({ raw, done: s, month: canManage ? monthCounts[p.id] ?? { leads: 0, appointments: 0 } : null, days: goalDays });

  const xdateHref = (m, b) => `/reports/x-dates?project=${p.id}&month=${m}${b ? `&bucket=${b}` : ""}#names`;
  const rates = { id: p.id, name: p.name, lead: Number(raw.lead_rate ?? 0), appointment: Number(raw.appointment_rate ?? 0), confirmation: Number(raw.confirmation_rate ?? 0) };

  return (
    <>
      <Topbar title="Project" sub={p.name} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Link href="/projects" className="back-link inline-flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary">
          <ArrowLeft className="size-3.5" /> Back to projects
        </Link>

        <Card accent="var(--neon-cyan)">
          <div className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ background: p.color }}>{p.name.slice(0, 2).toUpperCase()}</span>
                <div className="min-w-0">
                  <h2 className="break-words text-lg font-bold tracking-tight">{p.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    <Link href={`/clients/${clientSlug(p.client)}`} className="transition-colors hover:text-primary hover:underline">{p.client}</Link>
                    {client ? null : team.length ? ` · ${team.map((r) => r.short).join(", ")}` : " · nobody assigned"}
                    {p.salesRep ? <span data-project-sales-rep> · Sales Rep {p.salesRep}</span> : null}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ToneBadge tone={typeTone[p.type] ?? "slate"}>{p.type}</ToneBadge>
                <ToneBadge tone={statusTone[p.status] ?? "slate"}>{p.status}</ToneBadge>
                {admin ? <ProjectRatesForm project={rates} ranges={payRules?.rates} /> : null}
                {client ? null : <ProjectForm project={p.raw ? { ...p.raw, company: p.raw.company?.[0] ?? p.raw.company, type: p.raw.type?.[0] ?? p.raw.type, status: p.raw.status?.[0] ?? p.raw.status } : p} options={options} />}
              </div>
            </div>
            {p.description && !client ? <p className="mt-4 text-sm text-muted-foreground">{p.description}</p> : null}
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {p.startDate !== "—" || p.endDate !== "—" ? <span>{p.startDate} — {p.endDate}</span> : null}
              {raw.contact_name || raw.city || raw.phone ? (
                // This project's office: its agent, where it is and its time zone (the client's, or its own).
                <span data-project-office>
                  Office: {[raw.contact_name && `${raw.contact_name}${raw.contact_title ? `, ${raw.contact_title}` : ""}`, raw.phone,
                    [raw.address, raw.city, [raw.state, raw.zip].filter(Boolean).join(" ")].filter(Boolean).join(", "),
                    options.timezones?.find((z) => z.id === raw.timezone_id)?.name].filter(Boolean).join(" · ")}
                </span>
              ) : null}
              {apptProject ? (
                <span>Promotes leads to <Link href={`/projects/${apptProject.id}`} className="text-primary hover:underline">{apptProject.name}</Link></span>
              ) : null}
              {admin ? (
                <span data-rates>Pays {usd(rates.lead)} a lead · {usd(rates.appointment)} an appointment · {usd(rates.confirmation)} special pay a confirmation</span>
              ) : null}
            </div>
          </div>
        </Card>

        <ProjectGoals leads={leadGoal} appts={apptGoal} days={goalDays} hint={admin ? "No goals set. Edit the project to give it a lead or appointment goal." : null} />

        {/* The figures in one even row; then the call results beside the calendar, each as tall as the other. */}
        <div className="expand-row grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:flex" data-from="xl">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        {/* Side by side, the call results the wider (3 to 2); they hold still when pointed at (Sean, Oct 2026). */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]" data-project-cards>
          <ResultBreakdown rows={results} type={p.type} />
          <CalendarTile label="Project Calendar" days={days} blocked={blocked} today={today} first={calendar.first} last={calendar.last} query={`project=${p.id}`}
            note={scope?.shared ? `Shared with ${scope.label}, where this project's appointments go.` : "Only this project's appointments."}
            className="animate-pop-in" style={{ animationDelay: `${tiles.length * 60}ms` }} />
        </div>

        {client ? null : <ProjectTeam
          projectId={p.id}
          team={team}
          staff={staff}
          canManage={canManage}
          canOpenLists={canOpenLists}
          unassigned={overview.unassigned}
          namesLeft={overview.viableLeft}
        />}

        {/* The client's profile sheet (Sean, Oct 2026): what managers read on every lead sheet. The client
            fills it in from a private link as they come on board, and from their own sign-in after. */}
        {info ? (
          <Card id="project-info" data-project-info-card className="overflow-hidden">
            <SectionHeader wrap label="Project Info" icon={ClipboardList}
              action={admin ? (
                <div className="flex flex-wrap items-center gap-2">
                  {/* Tied to an appointment project: one sheet for them all, or its own (Sean, Oct 2026). */}
                  {info.tied_id ? <OwnInfoSwitch projectId={p.id} own={info.own} tiedName={info.tied_name} /> : null}
                  <InfoLinkDialog projectId={info.project_id} defaultTo={info.agent_email ?? info.client_email ?? ""} defaultName={info.contact_name ?? ""}
                    trigger={<Button size="sm" variant="outline" data-send-project-info><Send /> Send to client</Button>} />
                  <ProjectInfoDialog info={info} carriers={carriers} trigger={<Button size="sm" data-edit-project-info><Pencil /> Edit</Button>} />
                </div>
              ) : null} />
            <ProjectInfoView info={info} wide emptyHint="Send the client their link to fill it in, or fill it in here." />
          </Card>
        ) : null}

        <Card>
          <SectionHeader
            label="X-Dates by Month"
            icon={CalendarSearch}
            action={(
              <Link href={`/reports/x-dates?project=${p.id}`} className="flex items-center gap-1 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-primary transition-opacity hover:opacity-75">
                Full report <ArrowRight className="size-3" />
              </Link>
            )}
          />
          <div className="p-5">
            <XdateMonths data={xdates} href={xdateHref} today={today} compact />
          </div>
        </Card>

        <Card id="leads">
          <SectionHeader
            label="Leads on this Project"
            icon={ListChecks}
            action={admin ? (
              // Administrators only: every lead on the project, in the import template's columns. A plain download link.
              <a
                href={`/api/projects/${p.id}/export`}
                download
                data-export-project
                title="Every lead on this project with its current data, in the import template's columns"
                className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--panel-border)] px-2.5 py-1 text-[0.66rem] font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                <Download className="size-3.5" /> Export CSV
              </a>
            ) : null}
          />
          <FilterTable
            columns={["Company", "Contact", "Call result", "X-Date", "Assigned"]}
            filters={[
              // A project's names stand on its own kind of project's results.
              { key: "result", label: "Call result", kind: "select", options: callResults.filter((c) => c.project_type === (dbdev ? "DBDV" : "APPT")).map((c) => ({ value: String(c.id), label: c.name })) },
              ...(client ? [] : [{ key: "rep", label: "Assigned", kind: "select", options: team.map((r) => ({ value: String(r.id), label: r.name })) }]),
            ]}
            placeholder="Search this project's leads…"
            empty="No leads on this project yet."
            query={list.q}
            selected={list.filters}
            paging={pageInfo(leads.total, list.page, list.perPage)}
            rows={leads.rows.map((l) => ({
              id: l.id,
              node: (
                <TableRow>
                  <TableCell className="font-medium"><Link href={`/leads/${l.id}`} className="transition-colors hover:text-primary">{l.co}</Link></TableCell>
                  <TableCell>{l.contact}</TableCell>
                  <TableCell><ResultBadge result={l.result} /></TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{l.xdate}</TableCell>
                  <TableCell className={l.rep === "Unassigned" ? "text-muted-foreground" : ""}>{l.rep}</TableCell>
                </TableRow>
              ),
            }))}
          />
        </Card>
      </div>
    </>
  );
}
