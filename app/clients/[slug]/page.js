import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { clients, projects, clientSlug } from "@/lib/data";

const statusTone = { Active: "emerald", Paused: "amber", Draft: "slate" };

export function generateStaticParams() {
  return clients.map((c) => ({ slug: clientSlug(c.name) }));
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}

export default async function ClientProfile({ params }) {
  const { slug } = await params;
  const c = clients.find((x) => clientSlug(x.name) === slug);
  if (!c) notFound();

  const clientProjects = projects.filter((p) => p.client === c.name);
  const delivery = `leads-${slug}@signaturemktg.net`;

  return (
    <>
      <Topbar title="Client" sub={c.name} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Link href="/clients" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to clients
        </Link>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4 border-b pb-5">
              <span className="flex size-14 items-center justify-center rounded-2xl text-base font-semibold text-white" style={{ background: c.color }}>{c.initials}</span>
              <div>
                <h2 className="text-lg font-semibold">{c.name}</h2>
                <p className="text-sm text-muted-foreground">{c.city}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 py-5 sm:grid-cols-3">
              <Field label="Account manager">{c.manager}</Field>
              <Field label="Location">{c.city}</Field>
              <Field label="Delivery email"><span className="break-all">{delivery}</span></Field>
              <Field label="Active leads"><span className="tabular-nums">{c.leads}</span></Field>
              <Field label="Appointments / mo"><span className="tabular-nums">{c.appts}</span></Field>
              <Field label="Status"><span className="font-medium text-emerald-600">Active</span></Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Projects</CardTitle></CardHeader>
          <CardContent className="space-y-2 p-4">
            {clientProjects.length === 0 && <p className="px-2 text-sm text-muted-foreground">No projects on record.</p>}
            {clientProjects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-lg text-xs font-semibold text-white" style={{ background: p.color }}>{p.name.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.type} · {p.manager}</div>
                  </div>
                </div>
                <ToneBadge tone={statusTone[p.status]}>{p.status}</ToneBadge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
