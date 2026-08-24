import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import StatusBadge from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { projects, recentLeads, clientSlug } from "@/lib/data";

const typeTone = { DBDV: "sky", APPT: "violet" };
const statusTone = { Active: "emerald", Paused: "amber", Draft: "slate" };

export function generateStaticParams() {
  return projects.map((p) => ({ id: String(p.id) }));
}

export default async function ProjectDetail({ params }) {
  const { id } = await params;
  const p = projects.find((x) => String(x.id) === id);
  if (!p) notFound();

  const stats = [
    { label: "Leads", value: p.leads },
    { label: "Delivered", value: Math.round(p.leads * 0.72) },
    { label: "Appointments", value: Math.round(p.leads * 0.19) },
    { label: "Conversion", value: "21%" },
  ];

  return (
    <>
      <Topbar title="Project" sub={p.name} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Link href="/projects" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to projects
        </Link>

        <Card>
          <CardContent className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl text-sm font-semibold text-white" style={{ background: p.color }}>{p.name.slice(0, 2).toUpperCase()}</span>
                <div>
                  <h2 className="text-lg font-semibold">{p.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    <Link href={`/clients/${clientSlug(p.client)}`} className="transition-colors hover:text-foreground hover:underline">{p.client}</Link> · {p.manager}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ToneBadge tone={typeTone[p.type]}>{p.type}</ToneBadge>
                <ToneBadge tone={statusTone[p.status]}>{p.status}</ToneBadge>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-5">
                <div className="text-sm font-medium text-muted-foreground">{s.label}</div>
                <div className="mt-2 text-2xl font-semibold tabular-nums">{s.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle>Recent leads</CardTitle></CardHeader>
          <CardContent className="p-0">
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
                    <TableCell className="font-medium">
                      <Link href={`/leads/${l.id}`} className="hover:underline">{l.co}</Link>
                    </TableCell>
                    <TableCell>{l.contact}</TableCell>
                    <TableCell><StatusBadge status={l.status} /></TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{l.xdate}</TableCell>
                    <TableCell>{l.rep}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
