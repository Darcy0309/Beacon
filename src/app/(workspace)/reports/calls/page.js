import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, Search } from "lucide-react";
import Link from "@/components/shared/intent-link";
import Topbar from "@/components/layout/topbar";
import SectionHeader from "@/components/shared/section-header";
import ParamSelect from "@/components/shared/param-select";
import DateRangePicker from "@/components/shared/date-range-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RecordingPlayer } from "@/features/notifications/components/call-recording-card";
import { getCallLog } from "@/features/phone/queries";
import { getAssignableStaff } from "@/features/users/queries";
import { getBusinessTimeZone, getBusinessToday } from "@/lib/server/business-day";
import { getCurrentUser } from "@/lib/server/session";
import { CALL_KIND_LABEL, CALL_KINDS, callLogHref, callNumberDigits, readCallKind, readCallUser, talkClock } from "@/lib/call-log";
import { formatRange, isIsoDate } from "@/lib/dates";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PER_PAGE = 100;
const KIND_ICON = { out_handled: PhoneOutgoing, out_cancelled: PhoneOff, in_handled: PhoneIncoming, missed: PhoneMissed };

/**
 * Call Log (Sean, Nov 2026): every call on the Lighthouse phone, listed, as Call Activity counts them,
 * opened from a person's row or count there ("drill down by manager to show all of their outbound &
 * inbound calls for the selected date/range"), and a number looked up ("a prospect can call in from
 * their cell and it's not noted in the database on a lead"): who, when, which way, the number, the lead
 * (or a lead with that number), the talk time and the recording. Administrators see everyone's; an
 * account manager their own. Today to begin with; a number searched for, all time unless days are chosen.
 */
export default async function CallLog({ searchParams }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!["admin", "manager"].includes(me?.role)) notFound();
  const admin = me.role === "admin";
  const [today, tz, staff] = await Promise.all([getBusinessToday(), getBusinessTimeZone(), admin ? getAssignableStaff() : []]);

  const user = admin ? readCallUser(sp?.user) : me.id;
  const kind = readCallKind(sp?.kind);
  const q = typeof sp?.q === "string" ? sp.q.trim().slice(0, 30) : "";
  const digits = callNumberDigits(q);
  const chosen = isIsoDate(sp?.from) && isIsoDate(sp?.to);
  const all = sp?.range === "all" || (digits && !chosen);
  const from = all ? null : chosen ? (sp.from <= sp.to ? sp.from : sp.to) : today;
  const to = all ? null : chosen ? (sp.from <= sp.to ? sp.to : sp.from) : today;
  const page = /^[1-9]\d{0,4}$/.test(sp?.page ?? "") ? Number(sp.page) : 1;

  const log = await getCallLog({ from, to, user, kind, digits, limit: PER_PAGE, offset: (page - 1) * PER_PAGE });
  const counts = log.counts ?? { all: 0, out_handled: 0, out_cancelled: 0, in_handled: 0, missed: 0 };
  const pages = Math.max(1, Math.ceil(log.total / PER_PAGE));

  // The address with one thing changed (and back to the first page).
  const base = { user: admin ? (user ?? null) : null, kind, q: q || null, from: chosen ? from : null, to: chosen ? to : null, all: sp?.range === "all" };
  const href = (change) => callLogHref({ ...base, ...change });
  const whom = user === "none" ? "Calls that rang no one" : admin ? (user ? staff.find((u) => u.id === user)?.name ?? "One person" : "Everyone") : "My calls";
  const when = all ? "All time" : from === to ? (from === today ? "Today" : formatRange(from, to)) : formatRange(from, to);
  const clock = (iso) => new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", year: from && from.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const tabs = [[null, "All calls", counts.all], ...CALL_KINDS.map(([k, label]) => [k, label, counts[k]])];

  return (
    <>
      <Topbar title="Call Log" sub={`${whom} · ${when}${digits ? ` · numbers with ${q}` : ""}`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Card>
          <div className="flex flex-wrap items-center gap-2 px-5 py-3">
            {/* A number, any part of it: the calls to or from it (Sean, Nov 2026). */}
            <form action="/reports/calls" className="flex items-center gap-2" data-call-search>
              {admin && user != null ? <input type="hidden" name="user" value={String(user)} /> : null}
              {chosen ? <><input type="hidden" name="from" value={from} /><input type="hidden" name="to" value={to} /></> : null}
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input name="q" type="search" inputMode="tel" defaultValue={q} placeholder="Search a phone number" aria-label="Phone number" className="w-56 pl-8" />
              </div>
              <Button type="submit" size="sm" variant="outline">Search</Button>
              {q ? <Link href={href({ q: null })} className="text-xs text-muted-foreground hover:text-primary">Clear</Link> : null}
            </form>
            <form action="/reports/calls" className="flex items-center gap-2">
              {admin && user != null ? <input type="hidden" name="user" value={String(user)} /> : null}
              {kind ? <input type="hidden" name="kind" value={kind} /> : null}
              {q ? <input type="hidden" name="q" value={q} /> : null}
              <DateRangePicker key={`${from}:${to}`} defaultFrom={from ?? today} defaultTo={to ?? today} max="today" active={!all} />
            </form>
            <Link href={href({ all: true, from: null, to: null })} aria-current={all ? "true" : undefined} data-all-time
              className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                all ? "border-primary bg-primary/15 text-primary" : "border-[var(--panel-border)] text-muted-foreground hover:border-primary/40 hover:text-primary")}>
              All time
            </Link>
            {admin ? (
              <div className="ml-auto">
                <ParamSelect name="user" label="Person" placeholder="Everyone" value={user == null ? "" : String(user)}
                  options={[...staff.map((u) => ({ value: String(u.id), label: `${u.name} · ${u.role}` })), { value: "none", label: "Calls that rang no one" }]} />
              </div>
            ) : null}
          </div>
        </Card>

        <Card data-call-log>
          <SectionHeader wrap label="Calls" icon={PhoneCall} />
          <div className="flex flex-wrap gap-2 border-b border-[var(--panel-border)] px-5 py-3" role="group" aria-label="Which calls">
            {tabs.map(([k, label, n]) => (
              <Link key={k ?? "all"} href={href({ kind: k })} aria-current={kind === k ? "true" : undefined} data-call-kind={k ?? "all"}
                className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  kind === k ? "border-primary bg-primary/15 text-primary" : "border-[var(--panel-border)] text-muted-foreground hover:border-primary/40 hover:text-primary")}>
                {label} <span className="tabular-nums" data-count>{n.toLocaleString()}</span>
              </Link>
            ))}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  {admin ? <TableHead>Who</TableHead> : null}
                  <TableHead>Call</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead className="text-right">Talk time</TableHead>
                  <TableHead>Recording</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.rows.map((c) => {
                  const Icon = KIND_ICON[c.kind] ?? PhoneCall;
                  return (
                    <TableRow key={`${c.callSid}`} data-call={c.callSid} data-kind={c.kind}>
                      <TableCell className="whitespace-nowrap tabular-nums">{clock(c.startedAt)}</TableCell>
                      {admin ? <TableCell className={cn(!c.name && "text-muted-foreground")}>{c.name ?? "No one online"}</TableCell> : null}
                      <TableCell className="whitespace-nowrap">
                        <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", c.kind === "missed" ? "text-rose-500" : c.kind === "out_cancelled" ? "text-muted-foreground" : "")}>
                          <Icon className="size-3.5" aria-hidden /> {CALL_KIND_LABEL[c.kind]}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums" data-number>
                        <Link href={href({ q: c.number?.replace(/^\+1/, "") ?? null, kind: null, all: false, from: null, to: null, user: null })} title="Every call with this number"
                          className="hover:text-primary hover:underline">
                          {formatPhone(c.number) ?? c.number ?? "Unknown"}
                        </Link>
                      </TableCell>
                      <TableCell data-lead>
                        {c.leadId ? (
                          <span>
                            <Link href={`/leads/${c.leadId}`} className="font-medium hover:text-primary">{c.leadCompany || `Lead ${c.leadId}`}</Link>
                            {c.leadByNumber ? <span className="block text-[0.7rem] text-muted-foreground" data-by-number>has this number</span> : null}
                          </span>
                        ) : <span className="text-xs text-muted-foreground">Not on a lead</span>}
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", !c.talk && "text-muted-foreground")}>{talkClock(c.talk)}</TableCell>
                      <TableCell className="min-w-44">
                        {c.recording ? <RecordingPlayer src={`/api/phone/recordings/${c.recording.sid}`} seconds={c.recording.seconds} /> : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {log.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={admin ? 7 : 6} className="py-10 text-center text-muted-foreground">
                      {digits ? `No calls with a number containing ${q}${all ? "" : " in these days"}.` : "No calls in these days."}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--panel-border)] px-5 py-3 text-xs text-muted-foreground">
            <span>
              {log.total ? `${((page - 1) * PER_PAGE + 1).toLocaleString()}–${Math.min(page * PER_PAGE, log.total).toLocaleString()} of ${log.total.toLocaleString()}` : "0 calls"}
              {" · "}Calls on the Lighthouse phone. A missed call shows once for each person it rang, as Call Activity counts it.
            </span>
            {pages > 1 ? (
              <span className="flex items-center gap-2">
                {page > 1 ? <Button asChild size="icon" variant="outline"><Link href={callLogHref({ ...base, page: page - 1 })} aria-label="Newer calls"><ChevronLeft /></Link></Button> : null}
                <span className="tabular-nums">Page {page} of {pages}</span>
                {page < pages ? <Button asChild size="icon" variant="outline"><Link href={callLogHref({ ...base, page: page + 1 })} aria-label="Older calls" data-next-page><ChevronRight /></Link></Button> : null}
              </span>
            ) : null}
          </div>
        </Card>
      </div>
    </>
  );
}
