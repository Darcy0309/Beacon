import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, FolderKanban, Target, CalendarCheck, UserCog } from "lucide-react";
import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import StatTile from "@/components/stat-tile";
import SectionHeader from "@/components/section-header";
import { Card } from "@/components/ui/card";
import { clientSlug } from "@/lib/data";
import { getClientBySlug, getProjects } from "@/lib/queries";

export const dynamic = "force-dynamic";

const statusTone = { Active: "emerald", Paused: "amber", Draft: "slate", Completed: "sky" };

function Field({ label, children }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-1 text-sm">{children ?? "—"}</div>
    </div>
  );
}

export default async function ClientProfile({ params }) {
  const { slug } = await params;
  const c = await getClientBySlug(slug);
  if (!c) notFound();

  const clientProjects = (await getProjects()).filter((p) => p.client === c.name);
  const delivery = `leads-${slug}@signaturemktg.net`;
  const activeProjects = clientProjects.filter((p) => p.status === "Active").length;

  const tiles = [
    { label: "Active Leads", value: String(c.leads), note: "on this account",
      icon: Target, accent: "var(--neon-cyan)", series: clientProjects.map((p) => p.leads), bars: true },
    { label: "Appointments", value: String(c.appts), note: "set to date",
      icon: CalendarCheck, accent: "var(--neon-emerald)", series: clientProjects.map((p) => p.leads) },
    { label: "Campaigns", value: String(clientProjects.length), note: `${activeProjects} active`,
      icon: FolderKanban, accent: "var(--neon-violet)", series: clientProjects.map((p) => (p.status === "Active" ? 1 : 0.4)), bars: true },
    { label: "Conversion", value: c.leads ? `${Math.round((c.appts / c.leads) * 100)}%` : "—", note: "leads to appointments",
      icon: UserCog, accent: "var(--neon-amber)", series: clientProjects.map((p) => p.leads) },
  ];

  return (
    <>
      <Topbar title="Client" sub={c.name} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Link href="/clients" className="inline-flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary">
          <ArrowLeft className="size-3.5" /> Back to clients
        </Link>

        <Card accent="var(--neon-cyan)">
          <div className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--panel-border)] pb-5">
              <div className="flex items-center gap-4">
                <span className="flex size-14 items-center justify-center rounded-xl text-base font-bold text-white" style={{ background: c.color }}>{c.initials}</span>
                <div>
                  <h2 className="text-lg font-bold tracking-tight">{c.name}</h2>
                  <p className="text-sm text-muted-foreground">{c.city}</p>
                </div>
              </div>
              <ToneBadge tone={c.status === "Active" ? "emerald" : "slate"}>{c.status}</ToneBadge>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 pt-5 sm:grid-cols-3">
              <Field label="Account manager">{c.manager}</Field>
              <Field label="Primary contact">{c.contact}</Field>
              <Field label="Phone"><span className="tabular-nums">{c.phone}</span></Field>
              <Field label="Email"><span className="break-all">{c.email}</span></Field>
              <Field label="Delivery email"><span className="break-all">{delivery}</span></Field>
              <Field label="Location">{c.city}</Field>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        <Card>
          <SectionHeader label="Projects" icon={FolderKanban} href="/projects" action="All projects" />
          <div className="divide-y divide-[var(--panel-border)]">
            {clientProjects.length === 0 && <p className="p-6 text-sm text-muted-foreground">No projects on record.</p>}
            {clientProjects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} data-list-row className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-md text-xs font-bold text-white" style={{ background: p.color }}>{p.name.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.type} · {p.manager} · <span className="tabular-nums text-primary">{p.leads}</span> leads</div>
                  </div>
                </div>
                <ToneBadge tone={statusTone[p.status] ?? "slate"}>{p.status}</ToneBadge>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
