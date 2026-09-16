import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Target, Send, CalendarCheck, Percent, ListChecks, FolderKanban } from "lucide-react";
import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import StatusBadge from "@/components/status-badge";
import StatTile from "@/components/stat-tile";
import SectionHeader from "@/components/section-header";
import ProjectForm from "@/components/project-form";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { clientSlug } from "@/lib/data";
import { getProject, getLeadsByProject, getLookups } from "@/lib/queries";

export const dynamic = "force-dynamic";

const typeTone = { DBDV: "cyan", APPT: "violet" };
const statusTone = { Active: "emerald", Paused: "amber", Draft: "slate", Completed: "sky" };

export default async function ProjectDetail({ params }) {
  const { id } = await params;
  const p = await getProject(id);
  if (!p) notFound();

  const [recentLeads, options] = await Promise.all([getLeadsByProject(p.id, { limit: 25 }), getLookups()]);
  const delivered = recentLeads.filter((l) => l.status !== "new").length;
  const appts = recentLeads.filter((l) => l.status === "appt" || l.status === "survey").length;

  // Status mix across this campaign's leads, for the tile sparklines.
  const mix = {};
  for (const l of recentLeads) mix[l.status] = (mix[l.status] || 0) + 1;
  const series = Object.values(mix);

  const tiles = [
    { label: "Leads", value: String(p.leads), note: "on this campaign", icon: Target, accent: "var(--neon-cyan)", series, bars: true },
    { label: "Delivered", value: String(delivered), note: "worked past intake", icon: Send, accent: "var(--neon-emerald)", series },
    { label: "Appointments", value: String(appts), note: "phone and survey", icon: CalendarCheck, accent: "var(--neon-violet)", series, bars: true },
    { label: "Conversion", value: p.leads ? `${Math.round((appts / p.leads) * 100)}%` : "0%", note: "leads to appointments", icon: Percent, accent: "var(--neon-amber)", series },
  ];

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
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ background: p.color }}>{p.name.slice(0, 2).toUpperCase()}</span>
                <div>
                  <h2 className="text-lg font-bold tracking-tight">{p.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    <Link href={`/clients/${clientSlug(p.client)}`} className="transition-colors hover:text-primary hover:underline">{p.client}</Link> · {p.manager}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ToneBadge tone={typeTone[p.type] ?? "slate"}>{p.type}</ToneBadge>
                <ToneBadge tone={statusTone[p.status] ?? "slate"}>{p.status}</ToneBadge>
                <ProjectForm project={p.raw ? { ...p.raw, company: p.raw.company?.[0] ?? p.raw.company, type: p.raw.type?.[0] ?? p.raw.type, status: p.raw.status?.[0] ?? p.raw.status } : p} options={options} />
              </div>
            </div>
            {p.description ? <p className="mt-4 text-sm text-muted-foreground">{p.description}</p> : null}
            {(p.startDate !== "—" || p.endDate !== "—") && (
              <p className="mt-2 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{p.startDate} — {p.endDate}</p>
            )}
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        <Card>
          <SectionHeader label="Leads on this Campaign" icon={ListChecks} href="/leads" action="All leads" />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>X-Date</TableHead>
                <TableHead>Assigned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentLeads.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium"><Link href={`/leads/${l.id}`} className="transition-colors hover:text-primary">{l.co}</Link></TableCell>
                  <TableCell>{l.contact}</TableCell>
                  <TableCell><StatusBadge status={l.status} /></TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{l.xdate}</TableCell>
                  <TableCell>{l.rep}</TableCell>
                </TableRow>
              ))}
              {recentLeads.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No leads on this project yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
