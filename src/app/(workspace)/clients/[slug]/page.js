import Link from "@/components/shared/intent-link";
import { notFound } from "next/navigation";
import { ArrowLeft, FolderKanban, Target, CalendarCheck, Percent } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import ToneBadge from "@/components/shared/tone-badge";
import StatTile from "@/components/shared/stat-tile";
import SectionHeader from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";
import { clientSlug, mediumDate } from "@/lib/format";
import { getClientBySlug } from "@/features/clients/queries";
import ClientForm from "@/features/clients/components/client-form";
import { getProjects } from "@/features/projects/queries";
import { getAppointmentDays, getBlockedDays, getLeadStats } from "@/features/stats/queries";
import CalendarTile from "@/features/stats/components/calendar-tile";
import ConversionLines from "@/features/stats/components/conversion-lines";
import { addMonths, monthEnd, monthStart } from "@/lib/dates";
import { pctLabel, shapeStats, statsLine } from "@/lib/lead-stats";
import { getBusinessToday } from "@/lib/server/business-day";

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
  const [c, projects, today] = await Promise.all([getClientBySlug(slug), getProjects(), getBusinessToday()]);
  if (!c) notFound();

  const clientProjects = projects.filter((p) => p.clientId === c.id);
  const delivery = `leads-${slug}@signaturemktg.net`;
  // The client calendar: every project's appointments together, last month to three months on.
  const calendar = { first: addMonths(monthStart(today), -1), last: monthEnd(addMonths(monthStart(today), 3)) };
  const [stats, days, blocked] = await Promise.all([
    getLeadStats({ companyId: c.id }),
    getAppointmentDays({ projectIds: clientProjects.map((p) => p.id), from: calendar.first, to: calendar.last }),
    getBlockedDays({ projectIds: clientProjects.map((p) => p.id), from: calendar.first, to: calendar.last }),
  ]);
  const s = stats.total;
  const of = (p) => stats.byProject[p.id] ?? shapeStats(null);

  // Counted by call result (lead_stats()): where each name stands, not how many were loaded.
  const tiles = [
    { label: "Leads", value: s.leads.toLocaleString(), note: `${s.leadsActive.toLocaleString()} active · ${s.leadsResolved.toLocaleString()} resolved`,
      icon: Target, accent: "var(--neon-cyan)", series: clientProjects.map((p) => of(p).leads), bars: true },
    { label: "Appointments", value: s.appointments.toLocaleString(), note: `${s.invalid.toLocaleString()} invalid`,
      icon: CalendarCheck, accent: "var(--neon-emerald)", series: clientProjects.map((p) => of(p).appointments), bars: true },
    { label: "Conversions", value: pctLabel(s.leadRate), note: "of names became leads",
      icon: Percent, accent: "var(--neon-violet)", children: <ConversionLines s={s} /> },
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
              <div className="flex items-center gap-2">
                <ToneBadge tone={c.status === "Active" ? "emerald" : "slate"}>{c.status}</ToneBadge>
                <ClientForm client={c.raw} />
              </div>
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
          <CalendarTile label="Client Calendar" days={days} blocked={blocked} today={today} first={calendar.first} last={calendar.last} query={`client=${c.id}`}
            note="Every project's appointments together; shaded days are blocked out." className="animate-pop-in" style={{ animationDelay: "180ms" }} />
        </div>

        <Card>
          <SectionHeader label="Projects" icon={FolderKanban} href="/projects" action="All projects" />
          <div className="divide-y divide-[var(--panel-border)]">
            {clientProjects.length === 0 && <p className="p-6 text-sm text-muted-foreground">No projects on record.</p>}
            {clientProjects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} data-list-row data-client-project={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white" style={{ background: p.color }}>{p.name.slice(0, 2).toUpperCase()}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{p.name} <span className="ml-1 text-xs font-normal text-muted-foreground">{p.type} · {p.manager}</span></div>
                    {/* The same figures as the tiles above, for this project. */}
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums text-muted-foreground" data-project-stats>
                      {statsLine(of(p), p.type).map((part) => <span key={part}>{part}</span>)}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {p.raw?.start_date || p.raw?.end_date ? (
                    <span className="text-xs tabular-nums text-muted-foreground" data-project-dates>
                      {p.raw.start_date ? mediumDate(p.raw.start_date) : "—"} – {p.raw.end_date ? mediumDate(p.raw.end_date) : "—"}
                    </span>
                  ) : null}
                  <ToneBadge tone={statusTone[p.status] ?? "slate"}>{p.status}</ToneBadge>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
