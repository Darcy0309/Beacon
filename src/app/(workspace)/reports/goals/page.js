import { Goal } from "lucide-react";
import Link from "@/components/shared/intent-link";
import Topbar from "@/components/layout/topbar";
import SectionHeader from "@/components/shared/section-header";
import ToneBadge from "@/components/shared/tone-badge";
import ParamSelect from "@/components/shared/param-select";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GoalBar } from "@/features/projects/components/project-goals";
import { getProjects } from "@/features/projects/queries";
import { getLeadStats } from "@/features/stats/queries";
import { getBusinessToday } from "@/lib/server/business-day";
import { goalProgress, projectDays } from "@/lib/project-goals";
import { shapeStats } from "@/lib/lead-stats";

export const dynamic = "force-dynamic";

const SHOW = [["open", "Not completed"], ["all", "Every project"], ["behind", "Behind pace"], ["owed", "Still owed"]];
const rank = { behind: 0, "on pace": 1, null: 2, met: 3 };
const statusTone = { behind: "amber", "on pace": "cyan", met: "emerald" };

/**
 * Project Goals (the old backfill report): every project with a lead or
 * appointment goal, how much of it is delivered, what is still owed or was
 * given over, the days to go, and whether it keeps pace. Behind pace first.
 */
export default async function GoalsReport({ searchParams }) {
  const sp = await searchParams;
  const show = SHOW.some(([k]) => k === sp?.show) ? sp.show : "open";
  const [projects, today] = await Promise.all([getProjects(), getBusinessToday()]);
  const withGoals = projects.filter((p) => !p.raw.deleted_at && (p.raw.lead_goal || p.raw.appt_goal));
  // Counted as on each project's page (lead_stats(), by client: one read for each client's projects).
  const counted = await Promise.all([
    ...[...new Set(withGoals.map((p) => p.clientId).filter(Boolean))].map((companyId) => getLeadStats({ companyId })),
    ...withGoals.filter((p) => !p.clientId).map((p) => getLeadStats({ projectId: p.id })),
  ]);
  const byProject = Object.assign({}, ...counted.map((c) => c.byProject));

  const rows = withGoals
    .map((p) => {
      const s = byProject[p.id] ?? shapeStats(null);
      const days = projectDays({ start: p.raw.start_date, end: p.raw.end_date, today });
      const leads = goalProgress({ goal: p.raw.lead_goal, done: s.leads, share: days.share });
      const appts = goalProgress({ goal: p.raw.appt_goal, done: s.appointments, share: days.share });
      // The project's standing: behind if either goal is, met when every goal it has is.
      const goals = [leads, appts].filter(Boolean);
      const status = goals.some((g) => g.status === "behind") ? "behind"
        : goals.every((g) => g.status === "met") ? "met"
        : goals.some((g) => g.status === "on pace") ? "on pace" : null;
      return { p, days, leads, appts, status, owed: goals.reduce((n, g) => n + g.owed, 0) };
    })
    .filter((r) => show === "all" ? true
      : show === "behind" ? r.status === "behind"
      : show === "owed" ? r.owed > 0
      : r.p.status !== "Completed")
    .sort((a, b) => rank[a.status] - rank[b.status] || (a.days.daysLeft ?? 1e9) - (b.days.daysLeft ?? 1e9) || a.p.name.localeCompare(b.p.name));

  const owedLeads = rows.reduce((n, r) => n + (r.leads?.owed ?? 0), 0);
  const owedAppts = rows.reduce((n, r) => n + (r.appts?.owed ?? 0), 0);

  return (
    <>
      <Topbar title="Project Goals" sub={`${rows.length} project${rows.length === 1 ? "" : "s"} · ${owedLeads.toLocaleString()} leads and ${owedAppts.toLocaleString()} appointments still owed`} />
      <div className="flex-1 p-4 sm:p-6">
        <Card>
          <SectionHeader wrap label="Project Goals" icon={Goal}
            action={<ParamSelect name="show" label="Show" value={show} options={SHOW.map(([value, label]) => ({ value, label }))} />} />
          {rows.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              {show === "open" ? "No project has a goal yet. Edit a project to give it a lead or appointment goal." : "No projects to show."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table data-goals-table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead className="min-w-52">Leads</TableHead>
                    <TableHead className="min-w-52">Appointments</TableHead>
                    <TableHead>Pace</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ p, days, leads, appts, status }) => (
                    <TableRow key={p.id} data-goal-row={p.id}>
                      <TableCell>
                        <Link href={`/projects/${p.id}`} className="font-medium hover:text-primary">{p.name}</Link>
                        <div className="text-xs text-muted-foreground">{p.client} · {p.type} · {p.status}</div>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">
                        {p.startDate} – {p.endDate}
                        {days.daysLeft != null ? <div className="font-semibold text-foreground">{days.daysLeft} day{days.daysLeft === 1 ? "" : "s"} to go</div> : null}
                      </TableCell>
                      <TableCell>{leads ? <GoalBar label="Leads" g={leads} compact /> : <span className="text-xs text-muted-foreground">No goal</span>}</TableCell>
                      <TableCell>{appts ? <GoalBar label="Appointments" g={appts} compact /> : <span className="text-xs text-muted-foreground">No goal</span>}</TableCell>
                      <TableCell>{status ? <ToneBadge tone={statusTone[status]}>{status === "met" ? "Met" : status === "behind" ? "Behind" : "On pace"}</ToneBadge> : <span className="text-xs text-muted-foreground">No dates</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
