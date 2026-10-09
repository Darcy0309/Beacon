import Link from "@/components/shared/intent-link";
import { notFound } from "next/navigation";
import { AlarmClock, ArrowLeft, ArrowRight, CalendarClock, Send, CalendarPlus, ChevronDown, Mail, Pencil, Phone, PhoneCall, Repeat } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import StatusBadge from "@/components/shared/status-badge";
import ToneBadge from "@/components/shared/tone-badge";
import PrintButton from "@/components/shared/print-button";
import Tabs from "@/components/shared/tabs";
import LeadForm from "@/features/leads/components/lead-form";
import AppointmentForm from "@/features/appointments/components/appointment-form";
import CallResultPanel from "@/features/work/components/call-result-panel";
import EmailLead from "@/features/email/components/email-lead";
import CoverageForm from "@/features/leads/components/coverage-form";
import LeadNotes from "@/features/leads/components/lead-notes";
import ReminderCard from "@/features/leads/components/reminder-card";
import ResendButton from "@/features/delivery/components/resend-button";
import { getCarrierNames } from "@/features/insurance/queries";
import { POLICY_LINES } from "@/lib/coverage";
import { getEmailSender } from "@/features/email/queries";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getLead, getLeadActivity } from "@/features/leads/queries";
import { getCallResults, getNextOnList, getOpenAppointment, getWorkProject } from "@/features/work/queries";
import { getLookups } from "@/lib/server/lookups";
import { getCurrentUser } from "@/lib/server/session";
import { getBusinessTimeZone, getBusinessToday } from "@/lib/server/business-day";
import { daysBetween, todayIn } from "@/lib/dates";
import { fullName, mediumDate, shortDate, sicLabel, telHref } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ROUND = "flex size-8 shrink-0 items-center justify-center rounded-full text-white transition-all hover:brightness-110 active:scale-95";

/** Call a number: a tel: link (data-lead-id: pressing it starts the call's time for this name). */
function CallButton({ tel, leadId, label }) {
  return (
    <a href={tel} data-lead-id={leadId} aria-label={label} className={cn(ROUND, "bg-emerald-500 shadow-[0_0_14px_-6px_var(--neon-emerald)]")}>
      <Phone className="size-4" />
    </a>
  );
}

/** One way to reach someone: what it is, the number or address, and its button. */
function Line({ kind, children, action }) {
  return (
    <div data-contact-line={kind} className="flex items-center justify-between gap-3 border-t border-[var(--panel-border)] py-2">
      <div className="min-w-0">
        <div className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{kind}</div>
        <div className="break-all text-sm tabular-nums">{children}</div>
      </div>
      {action}
    </div>
  );
}

/**
 * A person to reach, as the contact card lists them: each number with a Call
 * button beside it and each address with an Email button. The contact always
 * has an Email line, so an address the contact gives on the phone can be
 * typed in and used at once.
 */
function Person({ who, phone, mobile, email: address, leadId, emailButton, alwaysEmail = false, allLines = false, children }) {
  const label = who.toLowerCase();
  const none = <span className="text-muted-foreground">None on file</span>;
  return (
    <div data-person={who}>
      {children}
      {address || ((alwaysEmail || allLines) && emailButton) ? (
        <Line kind="Email" action={emailButton?.(address)}>
          {address ?? <span className="text-muted-foreground">None on file</span>}
        </Line>
      ) : null}
      {phone || allLines ? (
        <Line kind="Business" action={telHref(phone) ? <CallButton tel={telHref(phone)} leadId={leadId} label={`Call ${label}, business: ${phone}`} /> : null}>
          {phone || none}
        </Line>
      ) : null}
      {mobile || allLines ? (
        <Line kind="Mobile" action={telHref(mobile) ? <CallButton tel={telHref(mobile)} leadId={leadId} label={`Call ${label}, mobile: ${mobile}`} /> : null}>
          {mobile || none}
        </Line>
      ) : null}
    </div>
  );
}

/** A fact under the contact card: label on the left, value on the right. */
function Fact({ label, children }) {
  const blank = children == null || children === "" || children === false;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right break-words">{blank ? <span className="text-muted-foreground">—</span> : children}</span>
    </div>
  );
}

/** The middle panel's rows: label and value, striped. */
function Rows({ rows }) {
  return (
    <div className="divide-y divide-[var(--panel-border)]">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[minmax(8rem,40%)_1fr] gap-3 px-4 py-2.5 text-sm odd:bg-muted/30">
          <span className="text-muted-foreground">{label}</span>
          <span className="min-w-0 break-words">{value == null || value === "" ? <span className="text-muted-foreground">—</span> : value}</span>
        </div>
      ))}
    </div>
  );
}

/** A history tab with nothing in it yet: a quiet message in the middle of the space. */
function Empty({ icon: Icon, children }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
      <Icon className="size-6 opacity-50" aria-hidden />
      {children}
    </div>
  );
}

const TH = "px-3 py-2 text-left text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground";
const TD = "px-3 py-2 align-top";

// The X-date rows on a lead sheet: every line the renewal date can come from.
const XDATE_ROWS = [
  ["Ultimate", "ultimate_xdate", "agency_name"],
  ["Liability / Package", "pkg_xdate", "pkg_carrier"],
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
 * The lead sheet, laid out as the client asked (after VanillaSoft): the
 * contact card on the left (who to reach, with a Call button by every number
 * and an Email button by every address, then where the name stands), the
 * business, coverage and notes in tabs in the middle, the call result
 * buttons on the right, and the history in tabs along the bottom. Opened
 * from a call list (?project=), it moves on to the next name on that list
 * after each result.
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
  // The lead's internal notes and its call notes: administrators and managers (the database gives an agent neither).
  const seesInternal = ["admin", "manager"].includes(me?.role);

  // Working a call list: where the list stands. And whether the caller is on
  // this name's project, which (like being its rep) lets them record on it.
  const [list, listProject, inProject, sender, carriers] = await Promise.all([
    listId ? getNextOnList(listId, [lead.id, ...skipped]) : null,
    listId ? getWorkProject(listId) : null,
    r.project && staff ? getWorkProject(r.project.id) : null,
    staff ? getEmailSender(me) : null,
    staff ? getCarrierNames() : [],
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
  // The appointment an Appointment result would move (record_call_result's rule: still to come or
  // waiting for QA, never one that failed it): the panel starts from its day and time.
  const movable = openAppt && openAppt.qa_status !== "failed" && (openAppt.qa_status === "pending" || String(openAppt.appt_date) >= today)
    ? {
        date: String(openAppt.appt_date).slice(0, 10),
        time: openAppt.appt_time ?? "",
        duration: openAppt.duration_min ?? 30,
        repName: openAppt.rep_name ?? "",
        when: `${mediumDate(openAppt.appt_date)}${openAppt.appt_time ? ` at ${openAppt.appt_time}` : ""}`,
      }
    : null;
  // With no Ultimate X-Date, the soonest policy line is a renewal to confirm before a Lead or Appointment.
  const soonest = ins?.ultimate_xdate ? null : xdates.filter(([, k]) => k !== "ultimate_xdate").map(([label, k]) => ({ label, date: ins[k] }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  const renewalHint = soonest ? `${soonest.label} renews ${shortDate(soonest.date)}` : null;

  // Whole days from the business's today: the server's clock runs on UTC.
  const daysOut = r.renewal ? daysBetween(today, String(r.renewal).slice(0, 10)) : null;
  const back = listId
    ? { href: `/work/${listId}`, label: "Back to call list" }
    : me?.role === "manager"
      ? { href: "/work", label: "My projects" }
      : { href: "/leads", label: "Back to leads" };

  // The lead account manager developed the name (database development); the
  // appointment manager holds it once it is promoted to appointment setting.
  const leadManager = r.developer ?? (r.stage === "dbdev" ? r.assigned : null);
  const apptManager = r.stage === "appt" ? r.assigned : null;

  // The policy lines the client always wants listed, and any other with something in it.
  const lines = POLICY_LINES.filter((l) => l.always || ins?.[l.date] || ins?.[l.carrier]);
  const coverage = Object.fromEntries([
    ["ultimate_xdate", ins?.ultimate_xdate ?? ""],
    ["agency_name", ins?.agency_name ?? ""],
    ["agency_years", ins?.agency_years ?? ""],
    ...POLICY_LINES.flatMap((l) => [[l.date, ins?.[l.date] ?? ""], [l.carrier, ins?.[l.carrier] ?? ""]]),
  ]);

  // The call history with the reminders set on the name among the calls, newest first.
  const history = [...activity.calls, ...activity.reminders.map((m) => ({ ...m, reminder: true }))]
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));

  // Dates and times in the history, on the business's clock.
  const stamp = (iso) =>
    iso
      ? new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" })
          .format(new Date(iso))
      : "—";
  const emailButton = (name, primary = false) =>
    canRecord && sender
      ? (to) => <EmailLead compact primary={primary} leadId={lead.id} company={lead.co} to={to} contact={name} sender={sender} admin={admin} />
      : null;
  const address = [r.address, [r.city, r.state, r.zip].filter(Boolean).join(" ")].filter(Boolean);
  const website = r.website ? <a href={/^https?:/.test(r.website) ? r.website : `https://${r.website}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{r.website}</a> : null;
  // The client notes (the client sees them) and the internal notes (staff only), counted on the tab.
  const noteCount = [r.client_note, seesInternal ? r.internal_notes : null].filter(Boolean).length;

  return (
    <>
      <Topbar title="Lead Sheet" sub={lead.co} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
            <Link href={back.href} className="inline-flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary">
              <ArrowLeft className="size-3.5" /> {back.label}
            </Link>
          </div>
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

        {/* Client information, as the old lead sheet led with: whose name this is. */}
        <Card data-client-info className="overflow-hidden">
          <div className="border-b border-[var(--panel-border)] px-4 py-2 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Client information
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 px-4 py-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Client", r.project?.company?.name],
              ["Project", r.project ? (
                staff && me?.role !== "agent"
                  ? <Link href={`/projects/${r.project.id}`} className="hover:text-primary">{r.project.name}</Link>
                  : r.project.name
              ) : null],
              // The client's agent taking this project's leads and appointments: the
              // name's own producer when an import gave one, else the project's contact.
              ["Producer name", r.producer_name || r.project?.contact_name],
              ["List source", r.list_source],
            ].map(([label, value]) => (
              <div key={label} data-banner-item={label} className="min-w-0">
                <dt className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 break-words font-medium">{value || <span className="text-muted-foreground">—</span>}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(17rem,1fr)_minmax(0,1.5fr)] xl:grid-cols-[minmax(17rem,1fr)_minmax(0,1.45fr)_minmax(19rem,1fr)]">
          {/* Left: the contact card. */}
          <Card data-contact-card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--panel-border)] px-1.5 py-1.5">
              <LeadForm lead={r} options={options} trigger={<Button size="sm" variant="ghost" className="px-2"><Pencil /> Edit</Button>} />
              <AppointmentForm
                options={options}
                leads={[{ id: lead.id, company_name: lead.co }]}
                defaultLeadId={lead.id}
                clientNote={r.client_note ?? ""}
                trigger={<Button size="sm" variant="ghost" className="px-2" aria-label="Add an appointment by hand"><CalendarPlus /> Appointment</Button>}
              />
              <span className="ml-auto"><PrintButton variant="ghost" compact /></span>
            </div>

            <div className="px-4 pb-3 pt-4">
              <Person
                who="Contact"
                phone={r.phone}
                mobile={r.contact_mobile}
                email={r.email}
                leadId={lead.id}
                alwaysEmail
                emailButton={emailButton(r.contact_name, true)}
              >
                <h2 className="text-lg font-bold leading-tight tracking-tight">{r.contact_name || <span className="text-muted-foreground">No contact name</span>}</h2>
                {r.contact_title ? (
                  <div className="mt-1 inline-block rounded border border-primary/40 bg-primary/5 px-2 py-0.5 text-xs text-primary">{r.contact_title}</div>
                ) : null}
                <div className="mt-3 text-sm font-semibold">{lead.co}</div>
                {address.map((line) => <div key={line} className="text-xs text-muted-foreground">{line}</div>)}
                {website ? <div className="mb-2 text-xs">{website}</div> : <div className="mb-2" />}
              </Person>

              {r.decision_maker || r.dm_phone || r.dm_mobile || r.dm_email ? (
                <div className="mt-3">
                  <Person
                    who="Decision maker"
                    allLines
                    phone={r.dm_phone}
                    mobile={r.dm_mobile}
                    email={r.dm_email}
                    leadId={lead.id}
                    emailButton={emailButton(r.decision_maker)}
                  >
                    <div className="eyebrow">Decision maker</div>
                    <div className="mb-2 mt-1 text-sm">
                      <span className="font-semibold">{r.decision_maker || "—"}</span>
                      {r.dm_title ? <span className="text-muted-foreground"> · {r.dm_title}</span> : null}
                    </div>
                  </Person>
                </div>
              ) : null}
              {r.contact2_name || r.contact2_phone || r.contact2_mobile || r.contact2_email ? (
                <div className="mt-3">
                  <Person
                    who="Secondary contact"
                    allLines
                    phone={r.contact2_phone}
                    mobile={r.contact2_mobile}
                    email={r.contact2_email}
                    leadId={lead.id}
                    emailButton={emailButton(r.contact2_name)}
                  >
                    <div className="eyebrow">Secondary contact</div>
                    <div className="mb-2 mt-1 text-sm">
                      <span className="font-semibold">{r.contact2_name || "—"}</span>
                      {r.contact2_title ? <span className="text-muted-foreground"> · {r.contact2_title}</span> : null}
                    </div>
                  </Person>
                </div>
              ) : null}
              {r.fax ? <Line kind="Fax">{r.fax}</Line> : null}
              {!r.phone && !r.contact_mobile ? <p className="border-t border-[var(--panel-border)] pt-2 text-xs text-muted-foreground">No phone number on file.</p> : null}
            </div>

            <div className="border-t border-[var(--panel-border)] px-4 py-3">
              <div className="flex flex-wrap items-center gap-1.5 pb-2">
                <StatusBadge status={lead.status} />
                {r.result ? <ToneBadge tone={r.result.viable ? "cyan" : "slate"}>{r.result.name}</ToneBadge> : null}
                {admin && daysOut !== null ? (
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
              </div>
              {/* The business's calendar day: a 6 pm call in Phoenix is already tomorrow in UTC. */}
              <Fact label="Last worked">{r.date_last_worked ? shortDate(todayIn(tz, new Date(r.date_last_worked))) : "Not yet"}</Fact>
              <Fact label="Lead account mgr">{leadManager ? fullName(leadManager) : null}</Fact>
              <Fact label="Appt mgr">{apptManager ? fullName(apptManager) : null}</Fact>
              {admin ? (
                <>
                  <Fact label="Stage">{STAGE[r.stage]}</Fact>
                  <Fact label="Calls this stage"><span className="tabular-nums">{r.call_weight}</span></Fact>
                  <Fact label="Renewal"><span className="font-semibold tabular-nums text-primary">{r.renewal ? mediumDate(r.renewal) : null}</span></Fact>
                  {r.source && r.source.id !== r.project?.id ? <Fact label="Came from">{r.source.name}</Fact> : null}
                  <Fact label="Lead ID"><span className="tabular-nums">#{lead.id}</span></Fact>
                  <Fact label="Added on">{r.lead_date ? shortDate(r.lead_date) : null}</Fact>
                </>
              ) : null}
            </div>
          </Card>

          {/* Middle: what the name is, in tabs. */}
          <Card className="overflow-hidden">
            <Tabs
              label="About this name"
              tabs={[
                {
                  id: "business",
                  label: "Business",
                  content: (
                    <Rows
                      rows={[
                        ["Company", lead.co],
                        ["Phone", r.phone],
                        ["Website", website],
                        ["Locations", r.location],
                        ["Employees", r.employees],
                        ["Autos", r.autos],
                        ["Sales volume", r.sales_volume],
                        ["EIN", r.ein ? <span className="tabular-nums">{r.ein}</span> : null],
                        ["Years in business", r.years_in_business],
                        ["SIC code", sicLabel(r.sic_code, r.sic_description)],
                        ["Est. premium", r.estimated_annual_premium],
                        ["County", r.county],
                      ]}
                    />
                  ),
                },
                {
                  id: "coverage",
                  label: "Coverage",
                  count: lines.filter((l) => ins?.[l.date]).length || null,
                  content: (
                    <div>
                      {canRecord ? (
                        <div className="flex justify-end border-b border-[var(--panel-border)] px-4 py-2">
                          <CoverageForm leadId={lead.id} company={lead.co} coverage={coverage} carriers={carriers} />
                        </div>
                      ) : null}
                      <Rows
                        rows={[
                          ["Ultimate XDate", ins?.ultimate_xdate ? <span className="font-semibold tabular-nums text-primary">{mediumDate(ins.ultimate_xdate)}</span> : null],
                          ["Agency", (ins?.agency_name ?? r.agency?.name)
                            ? `${ins?.agency_name ?? r.agency?.name}${ins?.agency_years != null ? ` · ${ins.agency_years} year${ins.agency_years === 1 ? "" : "s"} with them` : ""}`
                            : null],
                          ...(r.original_xdate
                            ? [["Original renewal", <span key="o"><span className="tabular-nums">{mediumDate(r.original_xdate)}</span><span className="text-muted-foreground"> · corrected on a call</span></span>]]
                            : []),
                        ]}
                      />
                      <table data-policy-lines className="w-full border-t border-[var(--panel-border)] text-sm">
                        <thead><tr><th className={TH}>Policy line</th><th className={TH}>X-Date</th><th className={TH}>Carrier</th></tr></thead>
                        <tbody className="divide-y divide-[var(--panel-border)]">
                          {lines.map((l) => (
                            <tr key={l.key} data-policy-line={l.key}>
                              <td className={cn(TD, "font-medium")}>{l.label}</td>
                              <td className={cn(TD, "tabular-nums", ins?.[l.date] ? "font-semibold" : "text-muted-foreground")}>{ins?.[l.date] ? mediumDate(ins[l.date]) : "—"}</td>
                              <td className={cn(TD, ins?.[l.carrier] ? null : "text-muted-foreground")}>{ins?.[l.carrier] || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ),
                },
                {
                  id: "notes",
                  label: "Notes",
                  count: noteCount || null,
                  content: (
                    <LeadNotes leadId={lead.id} clientNote={r.client_note} internalNotes={r.internal_notes} description={r.description} canEdit={staff} showInternal={seesInternal} />
                  ),
                },
              ]}
            />
          </Card>

          {/* Right: a call-back reminder, then the call result buttons. */}
          <div className="space-y-4 lg:col-span-2 xl:sticky xl:top-20 xl:col-span-1">
            {canRecord ? (
              <ReminderCard
                leadId={lead.id}
                company={lead.co}
                upcoming={activity.reminders.filter((m) => !m.sent && m.userId === me?.id).map((m) => ({ id: m.id, when: stamp(m.remindAt), note: m.note }))}
              />
            ) : null}
            {staff && r.projectType && r.stage !== (r.projectType === "APPT" ? "appt" : "dbdev") ? (
              // The name and its project disagree (the project's type was changed after the name was
              // loaded): say so, rather than offering the other stage's results without a word.
              <Card data-stage-mismatch className="border-amber-400/50 bg-amber-400/5 p-4 text-sm">
                <p className="font-semibold text-amber-500">This name is at the {STAGE[r.stage]?.toLowerCase()} stage</p>
                <p className="mt-1 text-muted-foreground">
                  But its project{r.project?.name ? <>, <strong className="text-foreground">{r.project.name}</strong>,</> : null} is set
                  to {STAGE[r.projectType === "APPT" ? "appt" : "dbdev"]?.toLowerCase()}, so that project type&apos;s results show below.
                  {admin
                    ? <> If the project is {r.stage === "dbdev" ? "a database development" : "an appointment setting"} project, change its Type; its names then show the right results.</>
                    : " An administrator can correct the project's type."}
                </p>
                {admin && r.project?.id ? (
                  <Link href={`/projects/${r.project.id}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                    Open the project <ArrowRight className="size-3" />
                  </Link>
                ) : null}
              </Card>
            ) : null}
            {canRecord ? (
              <CallResultPanel
                leadId={lead.id}
                listId={listId}
                projectType={r.projectType}
                results={results}
                followUp={followUp}
                ultimateXdate={ins?.ultimate_xdate ?? null}
                renewalHint={renewalHint}
                clientNote={r.client_note ?? ""}
                currentAppt={movable}
                timeZone={tz}
              />
            ) : staff ? (
              <Card className="p-5 text-sm text-muted-foreground">
                Results on this name are recorded by {lead.rep === "Unassigned" ? "the reps on its project." : /\.$/.test(lead.rep) ? lead.rep : `${lead.rep}.`}
              </Card>
            ) : null}
          </div>
        </div>

        {/* Along the bottom: the history. */}
        <Card className="overflow-hidden">
          <Tabs
            label="History"
            panelClassName="min-h-44"
            tabs={[
              {
                id: "calls",
                label: "Call History",
                count: history.length,
                content: history.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[40rem] text-sm">
                      <thead><tr><th className={TH}>Call date &amp; time</th><th className={TH}>Result</th><th className={TH}>Caller</th><th className={TH}>Stage</th><th className={TH}>Comments</th></tr></thead>
                      <tbody className="divide-y divide-[var(--panel-border)]">
                        {history.map((c) => c.reminder ? (
                          <tr key={`r${c.id}`} data-list-row data-reminder-row>
                            <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{stamp(c.at)}</td>
                            <td className={cn(TD, "whitespace-nowrap font-medium text-primary")}>
                              <span className="inline-flex items-center gap-1.5"><AlarmClock className="size-3.5" /> Call-back reminder</span>
                            </td>
                            <td className={cn(TD, "whitespace-nowrap")}>{c.by}</td>
                            <td className={cn(TD, "whitespace-nowrap text-muted-foreground")}>{c.sent ? "Sent" : "Set"}</td>
                            <td className={cn(TD, "text-muted-foreground")}>
                              <span className="font-medium text-foreground">For {stamp(c.remindAt)}</span>
                              {c.note ? <span className="block whitespace-pre-line">{c.note}</span> : null}
                            </td>
                          </tr>
                        ) : (
                          <tr key={c.id} data-list-row data-call-row>
                            <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{stamp(c.at)}</td>
                            <td className={cn(TD, "whitespace-nowrap font-medium")}>{c.result}</td>
                            <td className={cn(TD, "whitespace-nowrap")}>{c.by}</td>
                            <td className={cn(TD, "whitespace-nowrap text-muted-foreground")}>{c.stage ?? "—"}</td>
                            <td className={cn(TD, "whitespace-pre-line text-muted-foreground")}>{c.notes || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty icon={PhoneCall}>No calls yet.</Empty>
                ),
              },
              {
                id: "appointments",
                label: "Appointments",
                count: activity.appointments.length,
                content: activity.appointments.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[40rem] text-sm">
                      <thead><tr><th className={TH}>Date</th><th className={TH}>Time</th><th className={TH}>Length</th><th className={TH}>Status</th><th className={TH}>With</th><th className={TH}>Set by</th></tr></thead>
                      <tbody className="divide-y divide-[var(--panel-border)]">
                        {activity.appointments.map((a) => (
                          <tr key={a.id} data-list-row>
                            <td className={cn(TD, "whitespace-nowrap font-semibold tabular-nums")}>{a.date}</td>
                            <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{a.time ?? "—"}</td>
                            <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{a.duration} min</td>
                            <td className={TD}>
                              <span className="flex flex-wrap gap-1.5">
                                <ToneBadge tone={APPT_TONE[a.status] ?? "slate"}>{a.status}</ToneBadge>
                                {a.qa === "pending" ? <ToneBadge tone="amber">QA pending</ToneBadge> : a.qa === "failed" ? <ToneBadge tone="rose">QA failed</ToneBadge> : null}
                              </span>
                            </td>
                            <td className={TD}>{a.rep}</td>
                            <td className={cn(TD, "text-muted-foreground")}>{a.setBy ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty icon={CalendarClock}>No appointments yet.</Empty>
                ),
              },
              ...(staff
                ? [{
                    id: "deliveries",
                    label: "Deliveries",
                    count: activity.deliveries.length,
                    content: (
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--panel-border)] px-4 py-2 text-xs text-muted-foreground">
                          <span>
                            The lead sheet, emailed to the client when a call makes this a lead or an appointment
                            {r.project?.id ? <> (delivery emails: set on the project)</> : null}.
                          </span>
                          {canRecord ? <ResendButton leadId={lead.id} /> : null}
                        </div>
                        {activity.deliveries.length ? (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[40rem] text-sm">
                              <thead><tr><th className={TH}>Sent</th><th className={TH}>For</th><th className={TH}>To</th><th className={TH}>How</th><th className={TH}>Status</th></tr></thead>
                              <tbody className="divide-y divide-[var(--panel-border)]">
                                {activity.deliveries.map((d) => (
                                  <tr key={d.id} data-delivery-row>
                                    <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{stamp(d.at)}</td>
                                    <td className={cn(TD, "whitespace-nowrap font-medium")}>{d.result}{d.resent ? <span className="block text-xs font-normal text-muted-foreground">sent again by {d.by}</span> : null}</td>
                                    <td className={cn(TD, "break-all")}>{d.to}</td>
                                    <td className={cn(TD, "whitespace-nowrap text-muted-foreground")}>{d.linkOnly ? "Link" : "Lead sheet"}</td>
                                    <td className={TD}>
                                      {d.sent ? <ToneBadge tone="emerald">Sent</ToneBadge> : <ToneBadge tone="rose">Not sent</ToneBadge>}
                                      {d.error ? <span className="mt-1 block text-xs text-destructive">{d.error}</span> : null}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <Empty icon={Send}>Not sent to the client yet.</Empty>
                        )}
                      </div>
                    ),
                  }, {
                    id: "emails",
                    label: "Emails",
                    count: activity.emails.length,
                    content: (
                      <div className="divide-y divide-[var(--panel-border)]">
                        {activity.emails.map((e) => (
                          <details key={e.id} data-list-row data-email-row className="group px-4 py-2.5">
                            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                              <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="flex min-w-0 items-center gap-2">
                                  <Mail className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                                  <span className="truncate font-medium">{e.subject}</span>
                                </span>
                                <span className="flex shrink-0 items-center gap-2">
                                  {e.sent ? null : <ToneBadge tone="rose">Not sent</ToneBadge>}
                                  <span className="text-xs tabular-nums text-muted-foreground">{stamp(e.at)}</span>
                                </span>
                              </div>
                              <p className="flex items-center gap-1 pl-5 text-[0.7rem] text-muted-foreground">
                                <span className="min-w-0 truncate">To {e.to} · {e.by}</span>
                                <ChevronDown className="size-3 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
                              </p>
                            </summary>
                            {e.error ? <p className="mt-1 pl-5 text-xs text-destructive">{e.error}</p> : null}
                            <p className="mt-1 whitespace-pre-line break-words pl-5 text-xs text-muted-foreground">{e.body}</p>
                          </details>
                        ))}
                        {activity.emails.length === 0 && <Empty icon={Mail}>No emails yet.</Empty>}
                      </div>
                    ),
                  }]
                : []),
            ]}
          />
        </Card>
      </div>
    </>
  );
}
