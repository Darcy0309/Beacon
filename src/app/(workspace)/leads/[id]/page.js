import { isValidElement } from "react";
import Link from "@/components/shared/intent-link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, ArrowRight, CalendarPlus, ShieldCheck, Phone, PhoneCall, CalendarClock, Building2, UserRound,
  Flag, StickyNote, Repeat, Mail, ChevronDown,
} from "lucide-react";
import Topbar from "@/components/layout/topbar";
import StatusBadge from "@/components/shared/status-badge";
import ToneBadge from "@/components/shared/tone-badge";
import PrintButton from "@/components/shared/print-button";
import SectionHeader from "@/components/shared/section-header";
import LeadForm from "@/features/leads/components/lead-form";
import AppointmentForm from "@/features/appointments/components/appointment-form";
import CallResultPanel from "@/features/work/components/call-result-panel";
import EmailLead from "@/features/email/components/email-lead";
import { getEmailSender } from "@/features/email/queries";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getLead, getLeadActivity } from "@/features/leads/queries";
import { getCallResults, getNextOnList, getOpenAppointment, getWorkProject } from "@/features/work/queries";
import { getLookups } from "@/lib/server/lookups";
import { getCurrentUser } from "@/lib/server/session";
import { getBusinessTimeZone, getBusinessToday } from "@/lib/server/business-day";
import { daysBetween, todayIn } from "@/lib/dates";
import { fullName, mediumDate, shortDate, telHref } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Nothing to show: no value, or a wrapper (a <span>) around no value. */
const isBlank = (node) =>
  node == null || node === false || node === "" || (isValidElement(node) && isBlank(node.props.children));

function Field({ label, children, wide }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <div className="eyebrow">{label}</div>
      <div className="mt-1 break-words text-sm">{isBlank(children) ? <span className="text-muted-foreground">—</span> : children}</div>
    </div>
  );
}

function Box({ label, icon, children }) {
  return (
    <Card className="flex flex-col">
      <SectionHeader label={label} icon={icon} />
      <div className="grid flex-1 grid-cols-2 content-start gap-x-5 gap-y-4 p-5">{children}</div>
    </Card>
  );
}

/**
 * One person to reach, as the contact card shows them: name and title, then
 * each number with a Call button beside it and each address with an Email
 * button. A Call button is a tel: link (data-lead-id: pressing it starts the
 * call's time for this name), so it rings whichever number it sits by.
 */
function Person({ who, name, title, phone, mobile, email, leadId, emailButton }) {
  const lines = [
    phone ? { kind: "Business", value: phone, tel: telHref(phone) } : null,
    mobile ? { kind: "Mobile", value: mobile, tel: telHref(mobile) } : null,
    email ? { kind: "Email", value: email } : null,
  ].filter(Boolean);
  return (
    <div className="col-span-2" data-person={who}>
      <div className="eyebrow">{who}</div>
      <div className="mt-1 break-words text-sm">
        {name ? <span className="font-medium">{name}</span> : <span className="text-muted-foreground">—</span>}
        {title ? <span className="text-muted-foreground"> · {title}</span> : null}
      </div>
      {lines.length ? (
        <div className="mt-2 divide-y divide-[var(--panel-border)] rounded-lg border border-[var(--panel-border)]">
          {lines.map((l) => (
            <div key={l.kind} data-contact-line={l.kind} className="flex items-center justify-between gap-3 px-3 py-1.5">
              <div className="min-w-0">
                <div className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{l.kind}</div>
                <div className={l.tel ? "truncate text-sm tabular-nums" : "break-all text-sm"}>{l.value}</div>
              </div>
              {l.tel ? (
                <a
                  href={l.tel}
                  data-lead-id={leadId}
                  aria-label={`Call ${who.toLowerCase()}, ${l.kind.toLowerCase()}: ${l.value}`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_0_14px_-6px_var(--neon-emerald)] transition-all hover:brightness-110 active:scale-95"
                >
                  <Phone className="size-4" />
                </a>
              ) : l.kind === "Email" && emailButton ? (
                emailButton(l.value)
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">No phone or email on file.</p>
      )}
    </div>
  );
}

// The X-date rows on a lead sheet: every line the renewal date can come from.
const XDATE_ROWS = [
  ["Ultimate", "ultimate_xdate", "agency_name"],
  ["Package", "pkg_xdate", "pkg_carrier"],
  ["Workers comp", "wc_xdate", "wc_carrier"],
  ["Auto", "auto_xdate", "auto_carrier"],
  ["Health", "health_xdate", "health_carrier"],
  ["Dental", "dental_xdate", "dental_provider"],
  ["Vision", "vision_xdate", "vision_provider"],
  ["Prof. liability", "prof_liab_xdate", "prof_liab_carrier"],
  ["D&O", "do_xdate", "do_carrier"],
  ["E&O", "eo_xdate", "eo_carrier"],
];

const APPT_TONE = { Scheduled: "cyan", Confirmed: "emerald", Held: "violet", Rescheduled: "amber", Cancelled: "rose", "No Show": "slate", Invalid: "rose" };
const STAGE = { dbdev: "Database development", appt: "Appointment setting" };

/**
 * The lead sheet: four boxes (the business, the contact, their coverage,
 * where the name is in its life), the history underneath, and the call
 * result buttons on the right. Opened from a call list (?project=), it moves
 * on to the next name on that list after each result.
 */
export default async function LeadSheet({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const listId = /^[1-9]\d{0,17}$/.test(sp?.project ?? "") ? Number(sp.project) : null;
  // Names already skipped on this pass through the list, so Skip keeps going down it.
  const skipped = String(sp?.skipped ?? "").split(",").filter((v) => /^[1-9]\d{0,17}$/.test(v)).map(Number).slice(-50);

  const [lead, activity, options, me, results, openAppt, today, tz] = await Promise.all([
    getLead(id), getLeadActivity(id), getLookups(), getCurrentUser(), getCallResults(), getOpenAppointment(id), getBusinessToday(),
    getBusinessTimeZone(),
  ]);
  if (!lead) notFound();

  const r = lead.raw;
  const ins = r.insurance;
  const xdates = ins ? XDATE_ROWS.filter(([, k]) => ins[k]) : [];
  const admin = me?.role === "admin";
  const staff = ["admin", "manager", "agent"].includes(me?.role);

  // Working a call list: where the list stands. And whether the caller is on
  // this name's project, which (like being its rep) lets them record on it.
  const [list, listProject, inProject, sender] = await Promise.all([
    listId ? getNextOnList(listId, [lead.id, ...skipped]) : null,
    listId ? getWorkProject(listId) : null,
    r.project && staff ? getWorkProject(r.project.id) : null,
    staff ? getEmailSender(me) : null,
  ]);

  // The confirmation follow-up belongs to whoever set the appointment.
  const followUp = openAppt && (admin || openAppt.user_id === me?.id)
    ? {
        id: openAppt.id,
        setStage: openAppt.set_stage ?? r.stage,
        confirmed: Boolean(openAppt.confirmed_at),
        qa: openAppt.qa_status,
        when: `${shortDate(openAppt.appt_date)}${openAppt.appt_time ? ` · ${openAppt.appt_time}` : ""}`,
      }
    : null;

  const canRecord = admin || r.assigned?.id === me?.id || Boolean(inProject) || Boolean(followUp);
  // With no Ultimate X-Date, the soonest policy line is a renewal to confirm before a Lead or Appointment.
  const soonest = ins?.ultimate_xdate ? null : xdates.filter(([, k]) => k !== "ultimate_xdate").map(([label, k]) => ({ label, date: ins[k] }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  const renewalHint = soonest ? `${soonest.label} renews ${shortDate(soonest.date)}` : null;
  const tel = telHref(r.phone);
  // data-lead-id: pressing a phone link starts the call's time for this name.
  const phone = tel ? <a href={tel} data-lead-id={lead.id} className="tabular-nums transition-colors hover:text-primary">{r.phone}</a> : null;

  // Whole days from the business's today: the server's clock runs on UTC.
  const daysOut = r.renewal ? daysBetween(today, String(r.renewal).slice(0, 10)) : null;
  const back = listId
    ? { href: `/work/${listId}`, label: "Back to call list" }
    : me?.role === "manager"
      ? { href: "/work", label: "My projects" }
      : { href: "/leads", label: "Back to leads" };

  return (
    <>
      <Topbar title="Lead Sheet" sub={lead.co} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={back.href} className="inline-flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary">
            <ArrowLeft className="size-3.5" /> {back.label}
          </Link>
          {list ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">
                {listProject?.name ?? "Call list"} · <span className="font-semibold tabular-nums text-foreground">{list.left.toLocaleString()}</span> left
              </span>
              {list.next ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/leads/${list.next}?project=${listId}&skipped=${[...skipped, lead.id].slice(-50).join(",")}`}>Skip to next <ArrowRight /></Link>
                </Button>
              ) : null}
              <Button asChild size="sm" variant="ghost">
                <Link href="/work"><Repeat /> Change project</Link>
              </Button>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-4">
          <div className="space-y-4 xl:col-span-3">
            <Card accent="var(--neon-cyan)">
              <div className="flex flex-wrap items-start justify-between gap-4 p-5">
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
                  {r.result ? <ToneBadge tone={r.result.viable ? "cyan" : "slate"}>{r.result.name}</ToneBadge> : null}
                  <StatusBadge status={lead.status} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--panel-border)] px-5 py-3">
                <LeadForm lead={r} options={options} />
                <AppointmentForm
                  options={options}
                  leads={[{ id: lead.id, company_name: lead.co }]}
                  defaultLeadId={lead.id}
                  trigger={<Button size="sm" variant="outline"><CalendarPlus /> Add appointment by hand</Button>}
                />
                <PrintButton />
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {/* Write to the contact from Lighthouse: for whoever may work the name, as calls are. */}
                  {canRecord && sender ? (
                    <EmailLead leadId={lead.id} company={lead.co} to={r.email} contact={r.contact_name} sender={sender} admin={admin} />
                  ) : null}
                  {/* One click to dial: a tel: link opens the softphone, or the dialer on a phone. */}
                  {tel ? (
                    <Button asChild size="sm" className="bg-emerald-500 text-white shadow-[0_0_18px_-6px_var(--neon-emerald)] hover:brightness-110">
                      <a href={tel} title={`Call ${lead.co}`} data-lead-id={lead.id}>
                        <Phone /> Call now
                        <span className="font-medium normal-case tracking-normal tabular-nums opacity-85">{r.phone}</span>
                      </a>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">No phone number on file</span>
                  )}
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Box label="Business" icon={Building2}>
                <Field label="Company" wide>{lead.co}</Field>
                <Field label="Address" wide>{[r.address, [r.city, r.state, r.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</Field>
                <Field label="Phone">{phone}</Field>
                <Field label="Website">{r.website ? <a href={/^https?:/.test(r.website) ? r.website : `https://${r.website}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{r.website}</a> : null}</Field>
                <Field label="Employees"><span className="tabular-nums">{r.employees}</span></Field>
                <Field label="Autos"><span className="tabular-nums">{r.autos}</span></Field>
                <Field label="Sales volume">{r.sales_volume}</Field>
                <Field label="Years in business">{r.years_in_business}</Field>
                <Field label="SIC code">{r.sic_code}</Field>
                <Field label="Est. premium">{r.estimated_annual_premium}</Field>
              </Box>

              <Box label="Contact" icon={UserRound}>
                {[
                  { who: "Contact", name: r.contact_name, title: r.contact_title, phone: r.phone, mobile: r.contact_mobile, email: r.email },
                  { who: "Decision maker", name: r.decision_maker, title: r.dm_title, phone: r.dm_phone, mobile: r.dm_mobile, email: r.dm_email },
                ].map((p) => (
                  <Person
                    key={p.who}
                    {...p}
                    leadId={lead.id}
                    emailButton={canRecord && sender
                      ? (to) => <EmailLead compact leadId={lead.id} company={lead.co} to={to} contact={p.name} sender={sender} admin={admin} />
                      : null}
                  />
                ))}
                <Field label="Fax"><span className="tabular-nums">{r.fax}</span></Field>
              </Box>

              <Box label="Coverage" icon={ShieldCheck}>
                <Field label="Renewal"><span className="font-semibold tabular-nums text-primary">{r.renewal ? mediumDate(r.renewal) : null}</span></Field>
                <Field label="Current carrier">{r.agency?.name ?? ins?.agency_name}</Field>
                {r.original_xdate ? (
                  <Field label="Original renewal" wide>
                    <span className="tabular-nums">{mediumDate(r.original_xdate)}</span>
                    <span className="text-muted-foreground"> · corrected on a call</span>
                  </Field>
                ) : null}
                {xdates.length ? (
                  <div className="col-span-2 divide-y divide-[var(--panel-border)] rounded-lg border border-[var(--panel-border)]">
                    {xdates.map(([label, dateKey, carrierKey]) => (
                      <div key={label} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="font-medium">{label}</span>
                        <span className="flex items-center gap-3">
                          <span className="text-muted-foreground">{ins[carrierKey] ?? "—"}</span>
                          <span className="font-semibold tabular-nums">{shortDate(ins[dateKey])}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="col-span-2 text-sm text-muted-foreground">No policy dates on file.</p>
                )}
              </Box>

              <Box label="Where it stands" icon={Flag}>
                <Field label="Project" wide>
                  {r.project ? (
                    staff && me?.role !== "agent"
                      ? <Link href={`/projects/${r.project.id}`} className="hover:text-primary">{r.project.name}</Link>
                      : r.project.name
                  ) : null}
                </Field>
                <Field label="Stage">{STAGE[r.stage]}</Field>
                <Field label="Result">{r.result?.name}</Field>
                <Field label="Rep">{lead.rep}</Field>
                {admin ? <Field label="Calls this stage"><span className="tabular-nums">{r.call_weight}</span></Field> : <Field label="List source">{r.list_source}</Field>}
                {r.developer ? <Field label="Developed by">{fullName(r.developer)}</Field> : null}
                {r.source && r.source.id !== r.project?.id ? <Field label="Came from">{r.source.name}</Field> : null}
                {/* The business's calendar day: a 6 pm call in Phoenix is already tomorrow in UTC. */}
                <Field label="Last worked">{r.date_last_worked ? shortDate(todayIn(tz, new Date(r.date_last_worked))) : "Not yet"}</Field>
                <Field label="Lead ID"><span className="tabular-nums">#{lead.id}</span></Field>
              </Box>
            </div>

            {r.description || r.notes_dcm || r.notes_client ? (
              <Card>
                <SectionHeader label="Notes" icon={StickyNote} />
                <div className="space-y-3 p-5 text-sm">
                  {r.description ? <p className="text-muted-foreground">{r.description}</p> : null}
                  {r.notes_dcm ? <p><span className="eyebrow mr-2">Ours</span>{r.notes_dcm}</p> : null}
                  {r.notes_client ? <p><span className="eyebrow mr-2">Client</span>{r.notes_client}</p> : null}
                </div>
              </Card>
            ) : null}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <SectionHeader label="Call History" icon={PhoneCall} />
                <div className="space-y-1 p-4">
                  {activity.calls.map((c) => (
                    <div key={c.id} data-list-row className="-mx-2 rounded-lg px-2 py-2">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium">{c.result}</span>
                        <span className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground">{c.when}</span>
                      </div>
                      {c.notes ? <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">{c.notes}</p> : null}
                      <p className="text-[0.66rem] text-muted-foreground">{[c.by, c.stage].filter(Boolean).join(" · ")}</p>
                    </div>
                  ))}
                  {activity.calls.length === 0 && <p className="text-sm text-muted-foreground">No calls yet.</p>}
                </div>
              </Card>
              <Card>
                <SectionHeader label="Appointments" icon={CalendarClock} />
                <div className="space-y-1 p-4">
                  {activity.appointments.map((a) => (
                    <div key={a.id} data-list-row className="-mx-2 rounded-lg px-2 py-2">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-semibold tabular-nums">{a.date}</span>
                        <span className="flex gap-1.5">
                          {a.qa === "pending" ? <ToneBadge tone="amber">QA pending</ToneBadge> : a.qa === "failed" ? <ToneBadge tone="rose">QA failed</ToneBadge> : null}
                          <ToneBadge tone={APPT_TONE[a.status] ?? "slate"}>{a.status}</ToneBadge>
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">{[a.time, `${a.duration} min`, a.rep !== "—" ? `with ${a.rep}` : null, a.setBy ? `set by ${a.setBy}` : null].filter(Boolean).join(" · ")}</div>
                    </div>
                  ))}
                  {activity.appointments.length === 0 && <p className="text-sm text-muted-foreground">No appointments yet.</p>}
                </div>
              </Card>
            </div>

            {staff ? (
              <Card>
                <SectionHeader label="Emails" icon={Mail} />
                <div className="space-y-1 p-4">
                  {activity.emails.map((e) => (
                    <details key={e.id} data-list-row data-email-row className="group -mx-2 rounded-lg px-2 py-2">
                      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="min-w-0 truncate font-medium">{e.subject}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            {e.sent ? null : <ToneBadge tone="rose">Not sent</ToneBadge>}
                            <span className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground">{e.when}</span>
                          </span>
                        </div>
                        <p className="flex items-center gap-1 text-[0.66rem] text-muted-foreground">
                          <span className="min-w-0 truncate">To {e.to} · {e.by}</span>
                          <ChevronDown className="size-3 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
                        </p>
                      </summary>
                      {e.error ? <p className="mt-1 text-xs text-destructive">{e.error}</p> : null}
                      <p className="mt-1 whitespace-pre-line break-words text-xs text-muted-foreground">{e.body}</p>
                    </details>
                  ))}
                  {activity.emails.length === 0 && <p className="text-sm text-muted-foreground">No emails yet.</p>}
                </div>
              </Card>
            ) : null}
          </div>

          <div className="space-y-4 xl:sticky xl:top-20">
            {canRecord ? (
              <CallResultPanel
                leadId={lead.id}
                listId={listId}
                projectType={r.projectType}
                results={results}
                followUp={followUp}
                ultimateXdate={ins?.ultimate_xdate ?? null}
                renewalHint={renewalHint}
                timeZone={tz}
              />
            ) : staff ? (
              <Card className="p-5 text-sm text-muted-foreground">
                Results on this name are recorded by {lead.rep === "Unassigned" ? "the reps on its project." : /\.$/.test(lead.rep) ? lead.rep : `${lead.rep}.`}
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
