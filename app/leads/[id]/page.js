import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarPlus } from "lucide-react";
import Topbar from "@/components/topbar";
import StatusBadge from "@/components/status-badge";
import ToneBadge from "@/components/tone-badge";
import PrintButton from "@/components/print-button";
import LeadForm from "@/components/lead-form";
import AppointmentForm from "@/components/appointment-form";
import CallLogger from "@/components/call-logger";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getLead, getLeadActivity, getLookups } from "@/lib/queries";
import { colorFor, initials, cityState, longDate, shortName, fullName, timeAgo } from "@/lib/display";
import { APPT_TONE } from "@/lib/constants";

export const dynamic = "force-dynamic";

function Field({ label, children }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm">{children ?? "—"}</div>
    </div>
  );
}

// The X-date rows worth showing on a lead sheet.
const XDATE_ROWS = [
  ["Ultimate", "ultimate_xdate", "agency_name"],
  ["Package", "pkg_xdate", "pkg_carrier"],
  ["Workers comp", "wc_xdate", "wc_carrier"],
  ["Auto", "auto_xdate", "auto_carrier"],
  ["Health", "health_xdate", "health_carrier"],
  ["Dental", "dental_xdate", "dental_provider"],
  ["Prof. liability", "prof_liab_xdate", "prof_liab_carrier"],
];

export default async function LeadSheet({ params }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();

  const [activity, options] = await Promise.all([getLeadActivity(lead.id), getLookups()]);
  const ins = lead.insurance;
  const xdates = ins ? XDATE_ROWS.filter(([, dateKey]) => ins[dateKey]) : [];

  return (
    <>
      <Topbar title="Lead Sheet" sub={lead.company_name} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Link
          href="/leads"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to leads
        </Link>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex size-12 items-center justify-center rounded-xl text-sm font-semibold text-white"
                      style={{ background: colorFor(lead.company_name || "") }}
                    >
                      {initials(lead.company_name || "")}
                    </span>
                    <div>
                      <h2 className="text-lg font-semibold">{lead.company_name}</h2>
                      <p className="text-sm text-muted-foreground">{cityState(lead)}</p>
                    </div>
                  </div>
                  <StatusBadge status={lead.status} />
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-5 py-5 sm:grid-cols-3">
                  <Field label="Contact">{lead.contact_name}</Field>
                  <Field label="Title">{lead.contact_title}</Field>
                  <Field label="Phone">
                    <span className="tabular-nums">{lead.phone}</span>
                  </Field>
                  <Field label="Email">
                    <span className="break-all">{lead.email}</span>
                  </Field>
                  <Field label="Ultimate X-Date">
                    <span className="tabular-nums">{longDate(lead.xdate)}</span>
                  </Field>
                  <Field label="Assigned rep">
                    <span className={lead.assigned ? "" : "text-muted-foreground"}>
                      {shortName(lead.assigned)}
                    </span>
                  </Field>
                  <Field label="Project">
                    {lead.project ? (
                      <Link href={`/projects/${lead.project.id}`} className="hover:underline">
                        {lead.project.name}
                      </Link>
                    ) : null}
                  </Field>
                  <Field label="Current carrier">{lead.agency?.name}</Field>
                  <Field label="List source">{lead.list_source}</Field>
                  <Field label="Employees">
                    <span className="tabular-nums">{lead.employees}</span>
                  </Field>
                  <Field label="Autos">
                    <span className="tabular-nums">{lead.autos}</span>
                  </Field>
                  <Field label="Sales volume">{lead.sales_volume}</Field>
                  <Field label="Est. premium">{lead.estimated_annual_premium}</Field>
                  <Field label="Years in business">{lead.years_in_business}</Field>
                  <Field label="Lead ID">
                    <span className="tabular-nums">#{lead.id}</span>
                  </Field>
                </div>

                {lead.notes_dcm || lead.description ? (
                  <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                    <div className="mb-1 text-xs font-medium uppercase tracking-wide">Summary</div>
                    {lead.description ? <p>{lead.description}</p> : null}
                    {lead.notes_dcm ? <p className="mt-1.5">{lead.notes_dcm}</p> : null}
                  </div>
                ) : null}

                <div className="mt-6 flex flex-wrap gap-2 border-t pt-5">
                  <LeadForm lead={lead} options={options} />
                  <AppointmentForm
                    options={options}
                    leads={[lead]}
                    defaultLeadId={lead.id}
                    trigger={
                      <Button size="sm" variant="outline">
                        <CalendarPlus /> Set appointment
                      </Button>
                    }
                  />
                  <PrintButton />
                </div>
              </CardContent>
            </Card>

            {xdates.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Policy X-dates</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {xdates.map(([label, dateKey, carrierKey]) => (
                      <div
                        key={label}
                        data-list-row
                        className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                      >
                        <span className="font-medium">{label}</span>
                        <span className="flex items-center gap-4">
                          <span className="text-muted-foreground">{ins[carrierKey] ?? "—"}</span>
                          <span className="tabular-nums">{longDate(ins[dateKey])}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Appointments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {activity.appointments.map((a) => (
                  <div key={a.id} data-list-row className="-mx-2 rounded-lg px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium tabular-nums">{longDate(a.appt_date)}</span>
                      {a.status ? (
                        <ToneBadge tone={APPT_TONE[a.status.name] ?? "slate"}>{a.status.name}</ToneBadge>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[a.appt_time, `${a.duration_min ?? 30} min`, a.rep_name].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                ))}
                {activity.appointments.length === 0 && (
                  <p className="text-sm text-muted-foreground">No appointments yet.</p>
                )}
              </CardContent>
            </Card>

            <CallLogger leadId={lead.id} projectId={lead.project?.id} />

            <Card>
              <CardHeader>
                <CardTitle>Call history</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {activity.calls.map((c) => (
                  <div key={c.id} data-list-row className="-mx-2 rounded-lg px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{c.call_result ?? "Call"}</span>
                      <span className="text-xs text-muted-foreground">{timeAgo(c.call_date)}</span>
                    </div>
                    {c.notes ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{c.notes}</p>
                    ) : null}
                    <p className="text-[0.7rem] text-muted-foreground">{fullName(c.user)}</p>
                  </div>
                ))}
                {activity.calls.length === 0 && (
                  <p className="text-sm text-muted-foreground">No calls logged.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
