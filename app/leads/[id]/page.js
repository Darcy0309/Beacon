import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarPlus, FileText, ShieldCheck, PhoneCall, CalendarClock } from "lucide-react";
import Topbar from "@/components/topbar";
import StatusBadge from "@/components/status-badge";
import ToneBadge from "@/components/tone-badge";
import PrintButton from "@/components/print-button";
import LeadForm from "@/components/lead-form";
import AppointmentForm from "@/components/appointment-form";
import CallLogger from "@/components/call-logger";
import SectionHeader from "@/components/section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getLead, getLeadActivity, getLookups } from "@/lib/queries";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const longDate = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
};

function Field({ label, children }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-1 text-sm">{children ?? "—"}</div>
    </div>
  );
}

// The X-date rows worth showing on a lead sheet.
const XDATE_ROWS = [
  ["Ultimate", "ultimate_xdate", "agency_name", "var(--neon-amber)"],
  ["Package", "pkg_xdate", "pkg_carrier", "var(--neon-cyan)"],
  ["Workers comp", "wc_xdate", "wc_carrier", "var(--neon-emerald)"],
  ["Auto", "auto_xdate", "auto_carrier", "var(--neon-violet)"],
  ["Health", "health_xdate", "health_carrier", "var(--neon-magenta)"],
  ["Dental", "dental_xdate", "dental_provider", "var(--neon-blue)"],
  ["Prof. liability", "prof_liab_xdate", "prof_liab_carrier", "var(--neon-rose)"],
];

const APPT_TONE = { Scheduled: "cyan", Confirmed: "emerald", Held: "violet", Rescheduled: "amber", Cancelled: "rose", "No Show": "slate" };

export default async function LeadSheet({ params }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();

  const r = lead.raw;
  const [activity, options] = await Promise.all([getLeadActivity(lead.id), getLookups()]);
  const ins = r.insurance;
  const xdates = ins ? XDATE_ROWS.filter(([, k]) => ins[k]) : [];

  // Days until the ultimate renewal, for the header badge.
  const daysOut = ins?.ultimate_xdate
    ? Math.round((new Date(ins.ultimate_xdate).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <>
      <Topbar title="Lead Sheet" sub={lead.co} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Link href="/leads" className="inline-flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary">
          <ArrowLeft className="size-3.5" /> Back to leads
        </Link>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card accent="var(--neon-cyan)">
              <div className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--panel-border)] pb-5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-12 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ background: lead.color }}>{lead.initials}</span>
                    <div>
                      <h2 className="text-lg font-bold tracking-tight">{lead.co}</h2>
                      <p className="text-sm text-muted-foreground">{lead.city}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {daysOut !== null ? (
                      <span
                        className="rounded-full border px-2.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.12em]"
                        style={{
                          borderColor: `color-mix(in srgb, ${daysOut <= 30 ? "var(--neon-rose)" : "var(--neon-amber)"} 45%, transparent)`,
                          color: daysOut <= 30 ? "var(--neon-rose)" : "var(--neon-amber)",
                        }}
                      >
                        {daysOut < 0 ? `${Math.abs(daysOut)}d past renewal` : `${daysOut}d to renewal`}
                      </span>
                    ) : null}
                    <StatusBadge status={lead.status} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-5 py-5 sm:grid-cols-3">
                  <Field label="Contact">{lead.contact}</Field>
                  <Field label="Title">{r.contact_title}</Field>
                  <Field label="Phone"><span className="tabular-nums">{lead.phone}</span></Field>
                  <Field label="Email"><span className="break-all">{r.email}</span></Field>
                  <Field label="Ultimate X-Date"><span className="font-semibold tabular-nums text-primary">{lead.xdate}</span></Field>
                  <Field label="Assigned rep"><span className={lead.rep === "Unassigned" ? "text-muted-foreground" : ""}>{lead.rep}</span></Field>
                  <Field label="Project">
                    {r.project ? <Link href={`/projects/${r.project.id}`} className="hover:text-primary">{r.project.name}</Link> : null}
                  </Field>
                  <Field label="Current carrier">{r.agency?.name}</Field>
                  <Field label="List source">{r.list_source}</Field>
                  <Field label="Employees"><span className="tabular-nums">{r.employees}</span></Field>
                  <Field label="Autos"><span className="tabular-nums">{r.autos}</span></Field>
                  <Field label="Sales volume">{r.sales_volume}</Field>
                  <Field label="Est. premium">{r.estimated_annual_premium}</Field>
                  <Field label="Years in business">{r.years_in_business}</Field>
                  <Field label="Lead ID"><span className="tabular-nums">#{lead.id}</span></Field>
                </div>

                {r.description || r.notes_dcm ? (
                  <div className="rounded-lg border border-[var(--panel-border)] bg-secondary/40 p-4 text-sm text-muted-foreground">
                    <div className="eyebrow mb-1.5">Summary</div>
                    {r.description ? <p>{r.description}</p> : null}
                    {r.notes_dcm ? <p className="mt-1.5">{r.notes_dcm}</p> : null}
                  </div>
                ) : null}

                <div className="mt-6 flex flex-wrap gap-2 border-t border-[var(--panel-border)] pt-5">
                  <LeadForm lead={r} options={options} />
                  <AppointmentForm
                    options={options}
                    leads={[{ id: lead.id, company_name: lead.co }]}
                    defaultLeadId={lead.id}
                    trigger={<Button size="sm" variant="outline"><CalendarPlus /> Set appointment</Button>}
                  />
                  <PrintButton />
                </div>
              </div>
            </Card>

            {xdates.length > 0 && (
              <Card>
                <SectionHeader label="Policy X-Dates" icon={ShieldCheck} />
                <div className="divide-y divide-[var(--panel-border)]">
                  {xdates.map(([label, dateKey, carrierKey, color]) => (
                    <div key={label} data-list-row className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                      <span className="flex items-center gap-2.5">
                        <span className="size-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                        <span className="font-medium">{label}</span>
                      </span>
                      <span className="flex items-center gap-4">
                        <span className="text-muted-foreground">{ins[carrierKey] ?? "—"}</span>
                        <span className="font-semibold tabular-nums" style={{ color }}>{longDate(ins[dateKey])}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <SectionHeader label="Appointments" icon={CalendarClock} />
              <div className="space-y-1 p-4">
                {activity.appointments.map((a) => (
                  <div key={a.id} data-list-row className="-mx-2 rounded-lg px-2 py-2">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-semibold tabular-nums">{a.date}</span>
                      <ToneBadge tone={APPT_TONE[a.status] ?? "slate"}>{a.status}</ToneBadge>
                    </div>
                    <div className="text-xs text-muted-foreground">{[a.time, `${a.duration} min`, a.rep].filter(Boolean).join(" · ")}</div>
                  </div>
                ))}
                {activity.appointments.length === 0 && <p className="text-sm text-muted-foreground">No appointments yet.</p>}
              </div>
            </Card>

            <CallLogger leadId={lead.id} projectId={r.project?.id} />

            <Card>
              <SectionHeader label="Call History" icon={PhoneCall} />
              <div className="space-y-1 p-4">
                {activity.calls.map((c) => (
                  <div key={c.id} data-list-row className="-mx-2 rounded-lg px-2 py-2">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{c.result}</span>
                      <span className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground">{c.when}</span>
                    </div>
                    {c.notes ? <p className="mt-0.5 text-xs text-muted-foreground">{c.notes}</p> : null}
                    <p className="text-[0.66rem] text-muted-foreground">{c.by}</p>
                  </div>
                ))}
                {activity.calls.length === 0 && <p className="text-sm text-muted-foreground">No calls logged.</p>}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
