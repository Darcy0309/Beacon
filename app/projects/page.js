import { Plus, FolderKanban, Target, Activity, DollarSign } from "lucide-react";
import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import RowActions from "@/components/row-actions";
import ProjectForm from "@/components/project-form";
import StatTile from "@/components/stat-tile";
import SectionHeader from "@/components/section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getProjects, getLookups } from "@/lib/queries";
import { deleteProject } from "@/lib/actions";

export const dynamic = "force-dynamic";

const typeTone = { DBDV: "cyan", APPT: "violet" };
const statusTone = { Active: "emerald", Paused: "amber", Draft: "slate", Completed: "sky" };

export default async function ProjectsPage() {
  const [projects, options] = await Promise.all([getProjects(), getLookups()]);
  const active = projects.filter((p) => p.status === "Active").length;
  const totalLeads = projects.reduce((s, p) => s + p.leads, 0);
  const contract = projects.reduce((s, p) => s + Number(p.amount ?? 0), 0);

  const tiles = [
    { label: "Active Campaigns", value: String(active), note: `${projects.length} total`,
      icon: FolderKanban, accent: "var(--neon-cyan)", series: projects.map((p) => p.leads), bars: true },
    { label: "Leads Across Campaigns", value: totalLeads.toLocaleString(), note: "on the book",
      icon: Target, accent: "var(--neon-emerald)", series: projects.map((p) => p.leads) },
    { label: "Appointment Setting", value: String(projects.filter((p) => p.type === "APPT").length),
      note: `${projects.filter((p) => p.type === "DBDV").length} database development`,
      icon: Activity, accent: "var(--neon-violet)", series: projects.map((p) => (p.type === "APPT" ? 1 : 0)), bars: true },
    { label: "Contract Value", value: contract ? `$${Math.round(contract / 1000)}k` : "—", note: "across active work",
      icon: DollarSign, accent: "var(--neon-amber)", series: projects.map((p) => Number(p.amount ?? 0)), bars: true },
  ];

  return (
    <>
      <Topbar title="Projects" sub={`${active} active lead-generation and appointment campaigns`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        <Card>
          <SectionHeader
            label="All Projects"
            icon={FolderKanban}
            action={<ProjectForm options={options} trigger={<Button size="sm"><Plus /> New project</Button>} />}
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Leads</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 items-center justify-center rounded-md text-xs font-bold text-white" style={{ background: p.color }}>
                        {p.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="font-medium">{p.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{p.client}</TableCell>
                  <TableCell><ToneBadge tone={typeTone[p.type] ?? "slate"}>{p.type}</ToneBadge></TableCell>
                  <TableCell className="font-semibold tabular-nums text-primary">{p.leads}</TableCell>
                  <TableCell><ToneBadge tone={statusTone[p.status] ?? "slate"}>{p.status}</ToneBadge></TableCell>
                  <TableCell>{p.manager}</TableCell>
                  <TableCell className="text-right">
                    <RowActions name={p.name} href={`/projects/${p.id}`} id={p.id} onDelete={deleteProject} />
                  </TableCell>
                </TableRow>
              ))}
              {projects.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No projects yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
