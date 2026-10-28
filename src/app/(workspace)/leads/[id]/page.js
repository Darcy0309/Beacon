import Link from "@/components/shared/intent-link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { AlarmClock, ArrowLeft, ArrowRight, CalendarClock, ClipboardList, Send, ChevronDown, Mail, Pencil, Phone, PhoneCall, Printer, Repeat } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import ToneBadge from "@/components/shared/tone-badge";
import Tabs from "@/components/shared/tabs";
import ProspectForm from "@/features/leads/components/prospect-form";
import BusinessForm from "@/features/leads/components/business-form";
import CallResultPanel from "@/features/work/components/call-result-panel";
import EmailLead from "@/features/email/components/email-lead";
import CoverageForm from "@/features/leads/components/coverage-form";
import LeadNotes from "@/features/leads/components/lead-notes";
import ReminderCard from "@/features/leads/components/reminder-card";
import LeadFiles from "@/features/leads/components/lead-files";
import { listLeadFiles } from "@/features/leads/files";
import { createClient } from "@/lib/supabase/server";
import SendLead from "@/features/leads/components/send-lead";
import { getAssignableStaff } from "@/features/users/queries";
import { calendarLinks } from "@/lib/appointment-links";
import { reminderEvent } from "@/lib/reminder-event";
import { publicOrigin } from "@/lib/origin";
import ProjectCalendar from "@/features/calendar/components/project-calendar";
import UpdateStatus from "@/features/appointments/components/update-status";
import { getLeadAppointmentUpdates, getLeadAppointments } from "@/features/appointments/queries";
import { lineLabel, money, overdue, statusColor, statusLabel } from "@/lib/appointment-updates";
import { getProjectCalendar } from "@/features/calendar/queries";
import ResendButton from "@/features/delivery/components/resend-button";
import { getCarrierNames } from "@/features/insurance/queries";
import { POLICY_LINES } from "@/lib/coverage";
import { getEmailSender } from "@/features/email/queries";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getLead, getLeadActivity } from "@/features/leads/queries";
import { getCallResults, getNextOnList, getOpenAppointment, getWorkProject } from "@/features/work/queries";
import { getCurrentUser } from "@/lib/server/session";
import { getBusinessTimeZone, getBusinessToday } from "@/lib/server/business-day";
import { addMonths, daysBetween, monthGrid, monthStart, todayIn } from "@/lib/dates";
import { apptWhen, fullName, mediumDate, shortDate, sicLabel, telHref } from "@/lib/format";
import { cn } from "@/lib/utils";
import { autosLine, employeesLine, locationsLine, subcontractorsLine, xmodText, yesNo } from "@/lib/business";
import { getCargoTypes } from "@/features/cargo/queries";
import { backFrom } from "@/lib/back-link";
import { emailSignature } from "@/lib/email";
import { one } from "@/lib/server/query-helpers";
import ProjectInfoView from "@/features/project-info/components/project-info-view";
import { ProjectInfoDialog } from "@/features/project-info/components/project-info-form";
import { getProjectInfo } from "@/features/project-info/queries";
import { leadPlace } from "@/lib/project-info";
import HoldNotice from "@/features/delivery/components/hold-notice";
import TransferDialog from "@/features/leads/components/transfer-dialog";
import { getLeadHold } from "@/features/delivery/hold-queries";

export const dynamic = "force-dynamic";

const ROUND = "flex size-8 shrink-0 items-center justify-center rounded-full text-white transition-all hover:brightness-110 active:scale-95";

/** Call a number: a tel: link (data-lead-id: pressing it starts the call's time for this name; the phone names it by data-lead-name). */
function CallButton({ tel, leadId, company, label }) {
  return (
    <a href={tel} data-lead-id={leadId} data-lead-name={company || undefined} aria-label={label} className={cn(ROUND, "bg-emerald-500 shadow-[0_0_14px_-6px_var(--neon-emerald)]")}>
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
function Person({ who, phone, mobile, email: address, leadId, company, emailButton, alwaysEmail = false, allLines = false, children }) {
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
        <Line kind="Business" action={telHref(phone) ? <CallButton tel={telHref(phone)} leadId={leadId} company={company} label={`Call ${label}, business: ${phone}`} /> : null}>
          {phone || none}
        </Line>
      ) : null}
      {mobile || allLines ? (
        <Line kind="Mobile" action={telHref(mobile) ? <CallButton tel={telHref(mobile)} leadId={leadId} company={company} label={`Call ${label}, mobile: ${mobile}`} /> : null}>
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

  // What needs only the lead and who is asking starts as soon as those two are in, alongside the
  // lead's history (the slowest part), rather than after it: one round trip to the database fewer.
  const leadP = getLead(id);
  const meP = getCurrentUser();
  const todayP = getBusinessToday();
  const restP = Promise.all([leadP, meP, todayP]).then(async ([lead, me, today]) => {
    if (!lead) return null;
    const r = lead.raw;
    const staff = ["admin", "manager", "agent"].includes(me?.role);
    const seesInternal = ["admin", "manager"].includes(me?.role);
    const client = me?.role === "client";
    return Promise.all([
      // Working a call list: where the list stands. And whether the caller is on
      // this name's project, which (like being its rep) lets them record on it.
      listId ? getNextOnList(listId, [lead.id, ...skipped]) : null,
      listId ? getWorkProject(listId) : null,
      r.project && staff ? getWorkProject(r.project.id) : null,
      staff ? getEmailSender(me) : null,
      // The carriers: staff's coverage fields, a client's Sold Account lines.
      staff || client ? getCarrierNames() : [],
      seesInternal ? getAssignableStaff() : [],
      listLeadFiles(await createClient(), lead.id),
      // The cargo list, for the Business tab's Cargo field.
      staff ? getCargoTypes() : [],
      // The client's profile sheet for the project (Project Info), at hand while on the phone.
      r.project?.id ? getProjectInfo(r.project.id) : null,
      // Held back from the client by QA: its manager (or an administrator) fixes it and says so here.
      seesInternal ? getLeadHold(lead.id) : null,
      // The project's calendar, at hand while on the phone: this month and the two after (others are read as they are opened).
      // A client's people too (Sean, Oct 2026): their project's calendar, kept in view.
      (staff || client) && r.project?.id
        ? getProjectCalendar({ projectId: r.project.id, from: monthGrid(monthStart(today))[0], to: monthGrid(addMonths(monthStart(today), 2))[41] })
        : null,
      // Its appointments with how each went (a client's Call Result, and the update to make).
      client ? getLeadAppointments(lead.id) : [],
      // Every update made to them: administrators and managers, and the client's own people (Sean, Oct 2026).
      seesInternal || client ? getLeadAppointmentUpdates(lead.id) : [],
    ]);
  });
  const [lead, activity, me, results, openAppt, today, tz, rest] = await Promise.all([
    leadP, getLeadActivity(id), meP, getCallResults(), getOpenAppointment(id), todayP, getBusinessTimeZone(), restP,
  ]);
  if (!lead) notFound();

  const r = lead.raw;
  const ins = r.insurance;
  const xdates = ins ? XDATE_ROWS.filter(([, k]) => ins[k]) : [];
  const admin = me?.role === "admin";
  const staff = ["admin", "manager", "agent"].includes(me?.role);
  // The lead's internal notes and its call notes: administrators and managers (the database gives an agent neither).
  const seesInternal = ["admin", "manager"].includes(me?.role);

  const origin = publicOrigin(await headers());
  const [list, listProject, inProject, sender, carriers, staffList, files, cargoTypes, info, hold, calendar, leadAppts, apptUpdates] = rest;
  const client = me?.role === "client";
  // A client's Call Result: the lead's latest appointment, as their Appointments list has it.
  const latestAppt = leadAppts[0] ?? null;
  // Who a manager can send this lead to: anyone on the team but themselves.
  const people = staffList.filter((p) => p.id !== me?.id);

  // The confirmation follow-up belongs to whoever set the appointment.
  const followUp = openAppt && (admin || openAppt.user_id === me?.id)
    ? {
        id: openAppt.id,
        setStage: openAppt.set_stage ?? r.stage,
        confirmed: Boolean(openAppt.confirmed_at),
        qa: openAppt.qa_status,
        when: apptWhen(openAppt.appt_date, openAppt.appt_time),
      }
    : null;

  const canRecord = admin || r.assigned?.id === me?.id || Boolean(inProject) || Boolean(followUp);
  // The appointment an Appointment result would move (record_call_result's rule: still to come or
  // waiting for QA, never one that failed it): the panel starts from its day and time.
  const movable = openAppt && openAppt.qa_status !== "failed" && (openAppt.qa_status === "pending" || String(openAppt.appt_date) >= today)
    ? {
        id: openAppt.id,
        date: String(openAppt.appt_date).slice(0, 10),
        time: openAppt.appt_time ?? "",
        duration: openAppt.duration_min ?? 30,
        repName: openAppt.rep_name ?? "",
        when: apptWhen(openAppt.appt_date, openAppt.appt_time),
      }
    : null;
  // With no Ultimate X-Date, the soonest policy line is a renewal to confirm before a Lead or Appointment.
  const soonest = ins?.ultimate_xdate ? null : xdates.filter(([, k]) => k !== "ultimate_xdate").map(([label, k]) => ({ label, date: ins[k] }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  const renewalHint = soonest ? `${soonest.label} renews ${shortDate(soonest.date)}` : null;

  // Whole days from the business's today: the server's clock runs on UTC.
  const daysOut = r.renewal ? daysBetween(today, String(r.renewal).slice(0, 10)) : null;
  // Back where it was opened from: a call list, else the list (with its filters) that passed itself as ?from=.
  const back = listId
    ? { href: `/work/${listId}`, label: "Back to call list" }
    : backFrom(sp?.from) ?? (me?.role === "manager"
      ? { href: "/work", label: "My projects" }
      // A client opens their leads from the dashboard's Recent Activity (they have no Leads list).
      : me?.role === "client" ? { href: "/", label: "Back to dashboard" }
      : { href: "/leads", label: "Back to leads" });

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
  // Signed as the sender: their name, the client this lead is for, and their work phone and extension.
  const signature = emailSignature({ name: fullName(me), client: one(r.project?.company)?.name, phone: me?.phone, ext: me?.phone_ext });
  const emailButton = (name, primary = false) =>
    canRecord && sender
      ? (to) => <EmailLead compact primary={primary} leadId={lead.id} company={lead.co} to={to} contact={name} sender={sender} admin={admin} signature={signature} />
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
            <Link href={back.href} className="back-link inline-flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary">
              <ArrowLeft className="size-3.5" /> {back.label}
            </Link>
            {/* A lead the client can't use, given to another client (Sean, Oct 2026): administrators and account managers. */}
            {seesInternal ? <TransferDialog lead={{ id: lead.id, co: lead.co }} /> : null}
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
                admin
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
          {/* Left: Prospect Info (Sean, Oct 2026): the business, where it is, and its three people. */}
          <Card data-contact-card data-prospect-info className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--panel-border)] py-1.5 pl-4 pr-1.5">
              <span className="text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Prospect Info</span>
              <span className="ml-auto flex items-center gap-0.5">
                {staff ? <ProspectForm lead={r} trigger={<Button size="sm" variant="ghost" className="px-2" data-edit-prospect><Pencil /> Edit</Button>} /> : null}
                {/* The lead as the client gets it, to print: not a picture of this screen. */}
                <Button asChild size="sm" variant="ghost" className="px-2">
                  <a href={`/api/leads/${lead.id}/sheet`} target="_blank" rel="noreferrer" data-print-sheet><Printer /> Print</a>
                </Button>
              </span>
            </div>

            <div className="px-4 pb-3 pt-4">
              <h2 className="text-lg font-bold leading-tight tracking-tight">{lead.co}</h2>
              {address.map((line) => <div key={line} className="text-xs text-muted-foreground">{line}</div>)}
              {r.county ? <div className="text-xs text-muted-foreground" data-county>{/county$/i.test(r.county) ? r.county : `${r.county} County`}</div> : null}
              {website ? <div className="mt-1 text-xs">{website}</div> : null}
              <div className="mt-3">
                <Line kind="Business phone" action={telHref(r.phone) ? <CallButton tel={telHref(r.phone)} leadId={lead.id} company={lead.co} label={`Call the business: ${r.phone}`} /> : null}>
                  {r.phone || <span className="text-muted-foreground">None on file</span>}
                </Line>
                {r.fax ? <Line kind="Fax">{r.fax}</Line> : null}
              </div>

              {/* The three people, the decision maker first: every line of theirs, "None on file" when empty,
                  so a number or address given on the phone has its place; the secondary contact once there is one. */}
              {[
                ["Decision maker", r.decision_maker, r.dm_title, { phone: r.dm_phone, mobile: r.dm_mobile, email: r.dm_email, allLines: true }],
                ["Contact", r.contact_name, r.contact_title, { mobile: r.contact_mobile, email: r.email, alwaysEmail: true, primary: true }],
                ["Secondary contact", r.contact2_name, r.contact2_title, { phone: r.contact2_phone, mobile: r.contact2_mobile, email: r.contact2_email,
                  allLines: Boolean(r.contact2_name || r.contact2_phone || r.contact2_mobile || r.contact2_email) }],
              ].map(([who, name, title, ways]) => (
                <div key={who} className="mt-3">
                  <Person who={who} phone={ways.phone} mobile={ways.mobile} email={ways.email} leadId={lead.id} company={lead.co}
                    alwaysEmail={ways.alwaysEmail} allLines={ways.allLines} emailButton={emailButton(name, ways.primary)}>
                    <div className="eyebrow">{who}</div>
                    <div className="mb-2 mt-1 text-sm">
                      {name ? <span className="font-semibold">{name}</span> : <span className="text-muted-foreground">Not on file</span>}
                      {title ? <span className="text-muted-foreground"> · {title}</span> : null}
                    </div>
                  </Person>
                </div>
              ))}
            </div>

            <div className="border-t border-[var(--panel-border)] px-4 py-3">
              <div className="flex flex-wrap items-center gap-1.5 pb-2">
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
              initial={["files", "info"].includes(sp?.tab) ? sp.tab : undefined}
              tabs={[
                {
                  id: "business",
                  label: "Business",
                  content: (
                    <div>
                      {staff ? (
                        <div className="flex justify-end border-b border-[var(--panel-border)] px-4 py-2">
                          <BusinessForm lead={r} cargoTypes={cargoTypes} trigger={<Button size="sm" variant="outline" data-edit-business><Pencil /> Edit</Button>} />
                        </div>
                      ) : null}
                      <Rows
                        rows={[
                          ["Company", lead.co],
                          ["Phone", r.phone],
                          ["Locations", locationsLine(r)],
                          ["Employees", employeesLine(r)],
                          ["Sub-contractors", subcontractorsLine(r)],
                          ["Autos", autosLine(r)],
                          ["DOT#", r.dot_number ? <span className="tabular-nums">{r.dot_number}</span> : null],
                          ["Cargo", r.cargo],
                          ["XMOD", r.xmod != null ? <span className="tabular-nums">{xmodText(r.xmod)}</span> : null],
                          ["Sales volume", r.sales_volume],
                          ["Annual payroll", r.annual_payroll],
                          ["EIN", r.ein ? <span className="tabular-nums">{r.ein}</span> : null],
                          ["Years in business", r.years_in_business],
                          ["Est. annual premium", r.estimated_annual_premium],
                          ["Claims last 3 yrs", yesNo(r.claims_3yrs)],
                          ["Professionals", r.professionals],
                          ["Covered employees", r.covered_employees],
                          ["SIC code", sicLabel(r.sic_code, r.sic_description)],
                        ]}
                      />
                    </div>
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
                  // Files the prospect sent, kept with the lead and sent to the client with it.
                  id: "files",
                  label: "Policy Files",
                  count: files.length || null,
                  content: <LeadFiles leadId={lead.id} initial={files} canDelete={staff} />,
                },
                {
                  id: "notes",
                  label: "Notes",
                  count: noteCount || null,
                  content: (
                    <LeadNotes leadId={lead.id} clientNote={r.client_note} internalNotes={r.internal_notes} description={r.description} canEdit={staff} showInternal={seesInternal} />
                  ),
                },
                {
                  // The client's profile sheet (Sean, Oct 2026): the agent and office (its area code is the caller ID
                  // to call from; its address opens directions to this business), producers, what qualifies an
                  // appointment. Administrators and the client change it; everyone else reads it.
                  id: "info",
                  label: "Project Info",
                  content: info ? (
                    <ProjectInfoView
                      info={info}
                      toLead={leadPlace(r)}
                      action={admin ? <ProjectInfoDialog info={info} carriers={carriers} trigger={<Button size="sm" variant="outline" data-edit-project-info><Pencil /> Edit</Button>} /> : null}
                      emptyHint={admin ? "Fill it in here, or send the client their link from the project's page." : "An administrator or the client fills it in."}
                    />
                  ) : (
                    <Empty icon={ClipboardList}>{r.project ? "This project's info can't be shown." : "This name is not on a project."}</Empty>
                  ),
                },
              ]}
            />
          </Card>

          {/* Right: a call-back reminder, then the call result buttons. */}
          {/* Pinned beside the sheet; with the calendar under it, it scrolls on its own on a short screen. */}
          <div className="space-y-4 lg:col-span-2 xl:sticky xl:top-20 xl:col-span-1 xl:max-h-[calc(100svh-6rem)] xl:overflow-y-auto xl:pb-1">
            {hold?.status === "failed" ? <HoldNotice hold={hold} /> : null}
            {seesInternal && people.length ? <SendLead leadId={lead.id} company={lead.co} people={people} /> : null}
            {canRecord || client ? (
              <ReminderCard
                leadId={lead.id}
                company={lead.co}
                client={client}
                upcoming={activity.reminders.filter((m) => !m.sent && m.userId === me?.id).map((m) => ({
                  id: m.id, when: stamp(m.remindAt), note: m.note,
                  // To put on my own calendar, with the lead to open from it.
                  links: calendarLinks(reminderEvent({ remindAt: m.remindAt, note: m.note, lead: { id: lead.id, company_name: lead.co, ...r }, origin }), `${origin}/api/reminders/${m.id}/ics`),
                }))}
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
                calendarProjectId={calendar?.projectId ?? null}
              />
            ) : staff ? (
              <Card className="p-5 text-sm text-muted-foreground">
                Results on this name are recorded by {lead.rep === "Unassigned" ? "the reps on its project." : /\.$/.test(lead.rep) ? lead.rep : `${lead.rep}.`}
              </Card>
            ) : null}
            {client ? (
              // The client's Call Result (Sean, Oct 2026): where the name stands, and its appointment with how it went.
              <Card className="overflow-hidden" data-client-call-result>
                <div className="border-b border-[var(--panel-border)] px-4 py-2 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Call Result</div>
                <div className="space-y-2 px-4 py-3 text-sm">
                  <Fact label="Result">{r.result ? <ToneBadge tone={r.result.viable ? "cyan" : "slate"}>{r.result.name}</ToneBadge> : null}</Fact>
                  <Fact label="Appointment">{latestAppt ? <span className="tabular-nums" data-appt-when>{shortDate(latestAppt.date)}{latestAppt.apptTime ? ` · ${latestAppt.apptTime}` : ""}</span> : null}</Fact>
                  {latestAppt ? (
                    <>
                      <Fact label="Status">{latestAppt.status}</Fact>
                      <Fact label="Update status">
                        <span className="inline-flex items-center gap-1.5 font-semibold" data-lead-update={latestAppt.update}>
                          <span aria-hidden className="size-2 rounded-full" style={{ background: statusColor(latestAppt.update) }} />{latestAppt.updateLabel}
                        </span>
                      </Fact>
                      {latestAppt.update === "no_status" ? (
                        <p className={cn("text-xs", overdue(latestAppt.update, latestAppt.dueOn, today) ? "font-semibold text-rose-400" : "text-muted-foreground")}>
                          {overdue(latestAppt.update, latestAppt.dueOn, today) ? `Overdue: was due ${shortDate(latestAppt.dueOn)}` : `Update it by ${shortDate(latestAppt.dueOn)}`}
                        </p>
                      ) : null}
                      <UpdateStatus appt={{ ...latestAppt, co: lead.co }} carriers={carriers} />
                    </>
                  ) : null}
                </div>
              </Card>
            ) : null}
            {calendar ? <ProjectCalendar projectId={r.project.id} initial={calendar} today={today} leadLinks /> : null}
          </div>
        </div>

        {/* Along the bottom: the history. */}
        <Card className="overflow-hidden">
          <Tabs
            label="History"
            // From an update's notification (?tab=updates): its history open.
            initial={sp?.tab === "updates" && (seesInternal || client) ? "updates" : undefined}
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
              // Every update made to its appointments (Sean, Oct 2026): what, when, by whom and why; for the client too.
              ...(seesInternal || client
                ? [{
                    id: "updates",
                    label: "Appointment Updates",
                    count: apptUpdates.length,
                    content: apptUpdates.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[44rem] text-sm" data-appointment-updates>
                          <thead><tr><th className={TH}>Updated</th><th className={TH}>Status</th><th className={TH}>Appointment</th><th className={TH}>Premium</th><th className={TH}>Notes</th><th className={TH}>By</th></tr></thead>
                          <tbody className="divide-y divide-[var(--panel-border)]">
                            {apptUpdates.map((u) => (
                              <tr key={u.id} data-list-row data-update-row={u.id}>
                                <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{stamp(u.at)}</td>
                                <td className={TD}>
                                  <span className="inline-flex items-center gap-1.5 font-semibold">
                                    <span aria-hidden className="size-2 rounded-full" style={{ background: statusColor(u.status) }} />{statusLabel(u.status)}
                                  </span>
                                  {u.previous ? <div className="text-xs text-muted-foreground">was {statusLabel(u.previous)}</div> : null}
                                </td>
                                <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{u.apptDate ? `${shortDate(u.apptDate)}${u.apptTime ? ` · ${u.apptTime}` : ""}` : "—"}</td>
                                <td className={cn(TD, "tabular-nums")}>
                                  {u.total != null ? (
                                    <>
                                      <strong>{money(u.total)}</strong> written
                                      {(u.lines ?? []).map((l) => <div key={l.line} className="text-xs text-muted-foreground">{lineLabel(l.line)} {money(l.premium)} · {l.carrier}</div>)}
                                    </>
                                  ) : u.potential != null ? <>{money(u.potential)} potential</> : "—"}
                                </td>
                                <td className={cn(TD, "max-w-80 whitespace-pre-line break-words")}>{u.note ?? <span className="text-muted-foreground">—</span>}</td>
                                <td className={cn(TD, "text-muted-foreground")}>{u.by}{u.byClient ? " (client)" : ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty icon={CalendarClock}>{client ? "No updates yet: use Update status on the Call Result." : "The client has not updated this lead's appointments yet."}</Empty>
                    ),
                  }]
                : []),
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
                            {r.project?.id ? <> (to the project&apos;s delivery emails, and the producers ticked in Project Info)</> : null}.
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
