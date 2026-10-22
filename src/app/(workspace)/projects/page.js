import { Plus, FolderKanban, Target, Activity, DollarSign } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import Link from "@/components/shared/intent-link";
import ToneBadge from "@/components/shared/tone-badge";
import RowActions from "@/components/shared/row-actions";
import ProjectForm from "@/features/projects/components/project-form";
import StatTile from "@/components/shared/stat-tile";
import SectionHeader from "@/components/shared/section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import FilterTable from "@/components/shared/filter-table";
import { listProjects, getProjectStats, getOfficeOptions } from "@/features/projects/queries";
import { getClientGroups } from "@/features/clients/queries";
import { getLookups } from "@/lib/server/lookups";
import { readListParams, pageInfo } from "@/lib/paging";
import { deleteProject } from "@/features/projects/actions";
import { getCurrentUser } from "@/lib/server/session";
import { getSalesReps } from "@/features/users/queries";

export const dynamic = "force-dynamic";

const typeTone = { DBDV: "cyan", APPT: "violet" };
const statusTone = { Active: "emerald", Paused: "amber", Draft: "slate", Completed: "sky" };

export default async function ProjectsPage({ searchParams }) {
  const params = readListParams(await searchParams, ["status", "type", "client", "group", "rep"]);
  // ?rep=<user id>: the projects of the clients that Sales Rep owns (Sean, Oct 2026).
  if (params.filters.rep && !/^[1-9]\d{0,17}$/.test(params.filters.rep)) delete params.filters.rep;
  // ?group=<insurance company id>: the projects of the clients in that agency group.
  if (params.filters.group && !/^[1-9]\d{0,17}$/.test(params.filters.group)) delete params.filters.group;
  // A client's people see their own projects (Sean, Oct 2026): Row Level Security gives them no others; what is
  // ours to change (new, edit, delete), and the other clients' filters and contract value, is not shown them.
  const me = await getCurrentUser();
  const client = me?.role === "client";
  if (client) {
    delete params.filters.client;
    delete params.filters.group;
    delete params.filters.rep;
  }
  const [{ rows, total }, stats, lookups, offices, clientGroups, reps] = await Promise.all([
    listProjects(params), getProjectStats(), getLookups(), client ? {} : getOfficeOptions(), client ? {} : getClientGroups(), client ? [] : getSalesReps(),
  ]);
  const { projects } = stats;
  const statsOf = new Map(projects.map((p) => [p.id, p]));
  const groupOptions = [...new Map(Object.values(clientGroups).map((g) => [g.id, { value: String(g.id), label: g.name }])).values()].sort((a, b) => a.label.localeCompare(b.label));
  const options = { ...lookups, ...offices };

  // Tiles describe every project; the table shows one page of them.
  const active = projects.filter((p) => p.status === "Active").length;
  // Leads, not every name loaded: each once, whichever projects it passed through.
  const totalLeads = stats.total.leads;
  const contract = projects.reduce((s, p) => s + Number(p.amount ?? 0), 0);

  const tiles = [
    { label: "Active Campaigns", value: String(active), note: `${projects.length} total`,
      icon: FolderKanban, accent: "var(--neon-cyan)", series: projects.map((p) => p.leads), bars: true },
    { label: "Leads Across Campaigns", value: totalLeads.toLocaleString(), note: "in the pipeline",
      icon: Target, accent: "var(--neon-emerald)", series: projects.map((p) => p.leads) },
    { label: "Appointment Setting", value: String(projects.filter((p) => p.type === "APPT").length),
      // As the tile's own heading reads.
      note: <span className="stat-label" data-dbdev-count>{projects.filter((p) => p.type === "DBDV").length} database development</span>,
      icon: Activity, accent: "var(--neon-violet)", series: projects.map((p) => (p.type === "APPT" ? 1 : 0)), bars: true },
    ...(client ? [] : [{ label: "Contract Value", value: contract ? `$${Math.round(contract / 1000)}k` : "—", note: "across active work",
      icon: DollarSign, accent: "var(--neon-amber)", series: projects.map((p) => Number(p.amount ?? 0)), bars: true }]),
  ];

  return (
    <>
      <Topbar title="Projects" sub={`${active} active lead-generation and appointment campaigns`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="expand-row grid grid-cols-1 gap-4 sm:grid-cols-2 xl:flex" data-from="xl">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        <Card>
          <SectionHeader
            label="All Projects"
            icon={FolderKanban}
            action={client ? null : <ProjectForm options={options} trigger={<Button size="sm"><Plus /> New project</Button>} />}
          />
          <FilterTable
            columns={["Project", "Client", "Type", "Leads", "To call", "Status", ...(client ? [] : ["Manager"]), { label: "Action", className: "text-right" }]}
            filters={[
              { key: "status", label: "Status", options: options.projectStatuses.map((s) => ({ value: s.name, label: s.name })) },
              { key: "type", label: "Type", options: options.projectTypes.map((t) => ({ value: t.code, label: t.code })) },
              ...(client ? [] : [{ key: "client", label: "Client", kind: "select", options: options.companies.map((c) => ({ value: c.name, label: c.name })) }]),
              ...(!client && groupOptions.length ? [{ key: "group", label: "Agency group", kind: "select", options: groupOptions }] : []),
              ...(client ? [] : [{ key: "rep", label: "Sales Rep", kind: "select", options: reps.map((r) => ({ value: String(r.id), label: r.name })) }]),
            ]}
            placeholder="Search projects…"
            empty="No projects yet."
            query={params.q}
            selected={params.filters}
            paging={pageInfo(total, params.page, params.perPage)}
            rows={rows.map((p) => ({
              id: p.id,
              node: (
                <TableRow>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 items-center justify-center rounded-md text-xs font-bold text-white" style={{ background: p.color }}>
                        {p.name.slice(0, 2).toUpperCase()}
                      </span>
                      {/* The name opens the project; the menu on the right edits or deletes it. */}
                      <Link href={`/projects/${p.id}`} className="font-medium transition-colors hover:text-primary hover:underline" data-project-link>{p.name}</Link>
                    </div>
                  </TableCell>
                  <TableCell>
                    {p.client}
                    {p.group ? <span className="block text-xs text-muted-foreground" data-project-group>{p.group}</span> : null}
                  </TableCell>
                  <TableCell><ToneBadge tone={typeTone[p.type] ?? "slate"}>{p.type}</ToneBadge></TableCell>
                  {/* An appointment project's leads; a DB dev project's, those it developed. */}
                  <TableCell className="font-semibold tabular-nums text-primary" data-project-leads>{(statsOf.get(p.id)?.leads ?? 0).toLocaleString()}</TableCell>
                  {/* Still to call: names on a DB dev project, leads on an appointment project. */}
                  <TableCell className="tabular-nums text-muted-foreground" data-project-to-call
                    title={p.type === "DBDV" ? "Names still to call" : "Leads still to call for an appointment"}>{(statsOf.get(p.id)?.toCall ?? 0).toLocaleString()}</TableCell>
                  <TableCell><ToneBadge tone={statusTone[p.status] ?? "slate"}>{p.status}</ToneBadge></TableCell>
                  {client ? null : <TableCell>{p.manager}</TableCell>}
                  <TableCell className="text-right">
                    {client ? (
                      <Link href={`/projects/${p.id}`} className="text-xs font-semibold uppercase tracking-[0.1em] text-primary hover:underline">Open</Link>
                    ) : (
                    <RowActions
                      name={p.name}
                      href={`/projects/${p.id}`}
                      id={p.id}
                      edit={
                        <ProjectForm
                          project={{
                            ...p.raw,
                            company: p.raw.company?.[0] ?? p.raw.company,
                            type: p.raw.type?.[0] ?? p.raw.type,
                            status: p.raw.status?.[0] ?? p.raw.status,
                          }}
                          options={options}
                        />
                      }
                      onDelete={deleteProject}
                      warning={`The project comes off Lighthouse for everyone, with its ${Number(p.leads).toLocaleString()} name${Number(p.leads) === 1 ? "" : "s"} and their appointments: no list, call list, calendar or count shows them. Nothing is erased: an administrator can restore all of it under Settings › Deleted records. Calls made and pay earned stay as they are.`}
                    />
                    )}
                  </TableCell>
                </TableRow>
              ),
            }))}
          />
        </Card>
      </div>
    </>
  );
}
