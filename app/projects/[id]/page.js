import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import StatusBadge from "@/components/status-badge";
import ProjectForm from "@/components/project-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getProject, getLeadsByProject, getLookups } from "@/lib/queries";
import { colorFor, initials, shortName, shortDate, longDate } from "@/lib/display";
import { PROJECT_TONE } from "@/lib/constants";

export const dynamic = "force-dynamic";

const typeTone = { DBDV: "sky", APPT: "teal" };

export default async function ProjectDetail({ params }) {
  const { id } = await params;
  const p = await getProject(id);
  if (!p) notFound();

  const [leads, options] = await Promise.all([
    getLeadsByProject(p.id, { limit: 25 }),
    getLookups(),
  ]);

  const withAppt = leads.filter((l) => ["appt", "survey"].includes(l.status?.code)).length;
  const stats = [
    { label: "Leads", value: p.leadCount },
    { label: "Shown here", value: leads.length },
    { label: "Appointments", value: withAppt },
    {
      label: "Contract",
      value: p.amount_paid ? `$${Number(p.amount_paid).toLocaleString()}` : "—",
    },
  ];

  return (
    <>
      <Topbar title="Project" sub={p.name} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to projects
        </Link>

        <Card>
          <CardContent className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span
                  className="flex size-11 items-center justify-center rounded-xl text-sm font-semibold text-white"
                  style={{ background: colorFor(p.name) }}
                >
                  {initials(p.name)}
                </span>
                <div>
                  <h2 className="text-lg font-semibold">{p.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {p.company ? (
                      <Link
                        href={`/clients/${p.company.id}`}
                        className="transition-colors hover:text-foreground hover:underline"
                      >
                        {p.company.name}
                      </Link>
                    ) : (
                      p.client_name
                    )}
                    {p.manager ? ` · ${shortName(p.manager)}` : null}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {p.type ? (
                  <ToneBadge tone={typeTone[p.type.code] ?? "slate"}>{p.type.code}</ToneBadge>
                ) : null}
                {p.status ? (
                  <ToneBadge tone={PROJECT_TONE[p.status.name] ?? "slate"}>{p.status.name}</ToneBadge>
                ) : null}
                <ProjectForm project={p} options={options} />
              </div>
            </div>

            {p.description ? (
              <p className="mt-4 text-sm text-muted-foreground">{p.description}</p>
            ) : null}

            {(p.start_date || p.end_date) && (
              <p className="mt-2 text-xs text-muted-foreground">
                {longDate(p.start_date)} — {longDate(p.end_date)}
              </p>
            )}
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
          <CardHeader>
            <CardTitle>Leads on this project</CardTitle>
          </CardHeader>
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
                {leads.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">
                      <Link href={`/leads/${l.id}`} className="hover:underline">
                        {l.company_name}
                      </Link>
                    </TableCell>
                    <TableCell>{l.contact_name ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={l.status} />
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {shortDate(l.xdate)}
                    </TableCell>
                    <TableCell>{shortName(l.assigned)}</TableCell>
                  </TableRow>
                ))}
                {leads.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No leads on this project yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
