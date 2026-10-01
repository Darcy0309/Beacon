import Link from "@/components/shared/intent-link";
import { notFound } from "next/navigation";
import { ArrowLeft, Target, CalendarCheck, ListChecks, PhoneCall, CalendarSearch, ArrowRight } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import ToneBadge from "@/components/shared/tone-badge";
import StatusBadge from "@/components/shared/status-badge";
import StatTile from "@/components/shared/stat-tile";
import SectionHeader from "@/components/shared/section-header";
import FilterTable from "@/components/shared/filter-table";
import ProjectForm from "@/features/projects/components/project-form";
import ProjectRatesForm from "@/features/projects/components/project-rates-form";
import ProjectTeam from "@/features/projects/components/project-team";
import XdateMonths from "@/features/reports/components/xdate-months";
import { Card } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import { clientSlug } from "@/lib/format";
import { pageInfo, readListParams } from "@/lib/paging";
import { listLeads } from "@/features/leads/queries";
import { getProject, getProjectOverview, getProjectTeam } from "@/features/projects/queries";
import { getXdatesByMonth } from "@/features/reports/queries";
import { getAssignableStaff } from "@/features/users/queries";
import { getLookups } from "@/lib/server/lookups";
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
  const list = readListParams(sp, ["status", "rep"]);
  const me = await getCurrentUser();
  const admin = me?.role === "admin";
  const canManage = admin || me?.role === "manager";

  const [p, overview, team, leads, options, staff, xdates] = await Promise.all([
    getProject(id),
    getProjectOverview(id),
    getProjectTeam(id),
    listLeads(list, { projectId: id }),
    getLookups(),
    canManage ? getAssignableStaff() : [],
    getXdatesByMonth({ projectId: Number(id) }),
  ]);
  if (!p) notFound();

  const raw = p.raw ?? {};
  const apptProject = raw.appt_project_id ? options.projects.find((x) => x.id === raw.appt_project_id) : null;
  const canOpenLists = admin || team.some((r) => r.id === me?.id);
  const byMonth = (key) => xdates.months.map((m) => m[key]);

  const tiles = [
    { label: "Leads", value: overview.leads.toLocaleString(), note: `${overview.offList.toLocaleString()} off the list`,
      icon: Target, accent: "var(--neon-cyan)", series: byMonth("total"), bars: true },
    { label: "Names Left to Call", value: overview.viableLeft.toLocaleString(),
      note: overview.unassigned ? `${overview.unassigned.toLocaleString()} waiting for a rep` : `across ${team.length} rep${team.length === 1 ? "" : "s"}`,
      icon: ListChecks, accent: "var(--neon-emerald)", series: byMonth("viable") },
    { label: "Appointments", value: overview.appointments.toLocaleString(),
      note: `${overview.apptsMonth} this month · ${overview.qaPending} waiting for QA`,
      icon: CalendarCheck, accent: "var(--neon-violet)", series: byMonth("appointment"), bars: true },
    { label: "Calls This Month", value: overview.callsMonth.toLocaleString(), note: `${overview.callsToday} today · last ${overview.lastWorked.toLowerCase()}`,
      icon: PhoneCall, accent: "var(--neon-amber)", series: overview.calls14d, bars: true },
  ];

  const xdateHref = (m, b) => `/reports/x-dates?project=${p.id}&month=${m}${b ? `&bucket=${b}` : ""}#names`;
  const rates = { id: p.id, name: p.name, lead: Number(raw.lead_rate ?? 0), appointment: Number(raw.appointment_rate ?? 0), confirmation: Number(raw.confirmation_rate ?? 0) };

  return (
    <>
      <Topbar title="Project" sub={p.name} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Link href="/projects" className="inline-flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary">
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
                    {team.length ? ` · ${team.map((r) => r.short).join(", ")}` : " · nobody assigned"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ToneBadge tone={typeTone[p.type] ?? "slate"}>{p.type}</ToneBadge>
                <ToneBadge tone={statusTone[p.status] ?? "slate"}>{p.status}</ToneBadge>
                {admin ? <ProjectRatesForm project={rates} /> : null}
                <ProjectForm project={p.raw ? { ...p.raw, company: p.raw.company?.[0] ?? p.raw.company, type: p.raw.type?.[0] ?? p.raw.type, status: p.raw.status?.[0] ?? p.raw.status } : p} options={options} />
              </div>
            </div>
            {p.description ? <p className="mt-4 text-sm text-muted-foreground">{p.description}</p> : null}
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {p.startDate !== "—" || p.endDate !== "—" ? <span>{p.startDate} — {p.endDate}</span> : null}
              {apptProject ? (
                <span>Promotes leads to <Link href={`/projects/${apptProject.id}`} className="text-primary hover:underline">{apptProject.name}</Link></span>
              ) : null}
              {admin ? (
                <span data-rates>Pays {usd(rates.lead)} a lead · {usd(rates.appointment)} an appointment · {usd(rates.confirmation)} a confirmation</span>
              ) : null}
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        <ProjectTeam
          projectId={p.id}
          team={team}
          staff={staff}
          canManage={canManage}
          canOpenLists={canOpenLists}
          unassigned={overview.unassigned}
          namesLeft={overview.viableLeft}
        />

        <Card>
          <SectionHeader
            label="X-Dates by Month"
            icon={CalendarSearch}
            action={
              <Link href={`/reports/x-dates?project=${p.id}`} className="flex items-center gap-1 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-primary transition-opacity hover:opacity-75">
                Full report <ArrowRight className="size-3" />
              </Link>
            }
          />
          <div className="p-5">
            <XdateMonths data={xdates} href={xdateHref} compact />
          </div>
        </Card>

        <Card id="leads">
          <SectionHeader label="Leads on this Project" icon={ListChecks} />
          <FilterTable
            columns={["Company", "Contact", "Status", "X-Date", "Assigned"]}
            filters={[
              { key: "status", label: "Status", kind: "chips", options: options.statuses.map((s) => ({ value: s.code, label: s.name })) },
              { key: "rep", label: "Assigned", kind: "select", options: team.map((r) => ({ value: String(r.id), label: r.name })) },
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
                  <TableCell><StatusBadge status={l.status} /></TableCell>
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
