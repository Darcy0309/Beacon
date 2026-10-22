"use client";

import { useState } from "react";
import Link from "@/components/shared/intent-link";
import UpdateStatus from "@/features/appointments/components/update-status";
import { money, overdue, statusColor } from "@/lib/appointment-updates";
import { formatIso } from "@/lib/dates";
import { leadHref } from "@/lib/back-link";

const COLS = ["Company", "Project", "Agent", "Developed", "Appointment", "Status", "X-Date", "Manager", "Update Status", ""];
const GRID = "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_4.5rem_7.5rem_7rem_4.5rem_minmax(0,0.9fr)_minmax(0,1.25fr)_9rem]";
const STATUS_TONE = { Appointment: "var(--neon-cyan)", "Appointment-Confirmed": "var(--neon-emerald)", "Appointment-Invalid": "var(--neon-rose)" };
// In the badge, the part after "Appointment-" (the whole word for a plain one).
const shortStatus = (s) => (s?.startsWith("Appointment-") ? s.slice(12) : s);

const day = (iso) => (iso ? formatIso(String(iso).slice(0, 10), "short") : "—");
const developed = (iso, tz) => (iso ? new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(new Date(iso)) : "—");

/**
 * A client's appointments (Sean, Oct 2026), as their dashboard's Recent
 * Activity has them, with how each went: the company (opening its lead
 * sheet), project, agent, when it was developed, its day and time, what it
 * is, its X-date, the manager who set it, its Update Status (and the day it
 * is due by), and Update status at the far right. `openId`: an appointment
 * to open the update for at once (from a reminder's link); `back`: this list's
 * address, for the lead sheet's way back.
 */
export default function ClientAppointments({ rows, carriers, today, timeZone, openId = null, back }) {
  const [opened, setOpened] = useState(openId);
  return (
    <div data-client-appointments>
      <div className={`hidden gap-x-3 border-b border-[var(--panel-border)] px-5 py-2 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground lg:grid ${GRID}`}>
        {COLS.map((c, i) => <span key={i}>{c}</span>)}
      </div>
      {rows.map((a) => {
        const late = overdue(a.update, a.dueOn, today);
        const tone = STATUS_TONE[a.status] ?? "var(--neon-cyan)";
        return (
          <div key={a.id} data-client-appt={a.id} data-update={a.update}
            className={`grid grid-cols-1 items-center gap-x-3 gap-y-1 border-b border-[var(--panel-border)] px-5 py-3 text-sm last:border-0 ${GRID}`}>
            <div className="min-w-0">
              <Link href={leadHref(a.leadId, back)} className="block break-words font-medium hover:text-primary lg:line-clamp-2" data-appt-lead={a.leadId}>{a.co}</Link>
              {a.location ? <div className="truncate text-xs text-muted-foreground">{a.location}</div> : null}
            </div>
            <div className="min-w-0 break-words text-muted-foreground lg:line-clamp-2" title={a.project}><span className="lg:hidden">Project: </span>{a.project}</div>
            <div className="min-w-0 break-words lg:line-clamp-2" title={a.agent}><span className="text-muted-foreground lg:hidden">Agent: </span>{a.agent}</div>
            <div className="tabular-nums text-muted-foreground"><span className="lg:hidden">Developed </span>{developed(a.developedAt, timeZone)}</div>
            <div className="tabular-nums" data-col="appt">{day(a.date)}<span className="text-muted-foreground"> · {a.apptTime ?? "—"}</span></div>
            <div>
              <span className="inline-flex rounded-full border px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.08em]" title={a.status} data-appt-status={a.status}
                style={{ borderColor: `color-mix(in srgb, ${tone} 45%, transparent)`, background: `color-mix(in srgb, ${tone} 8%, transparent)`, color: tone }}>
                {shortStatus(a.status)}
              </span>
            </div>
            <div className="tabular-nums text-muted-foreground"><span className="lg:hidden">X-Date </span>{day(a.xdate)}</div>
            <div className="min-w-0 break-words lg:line-clamp-2" title={a.manager} data-col="manager"><span className="text-muted-foreground lg:hidden">Manager: </span>{a.manager}</div>
            <div className="min-w-0" data-col="update">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: statusColor(a.update) }} />{a.updateLabel}
              </span>
              <div className={`text-xs ${late ? "font-semibold text-rose-400" : "text-muted-foreground"}`} data-update-meta>
                {a.update === "sold" && a.total != null ? `${money(a.total)} written · ` : a.update === "valid_quoting" && a.potential != null ? `${money(a.potential)} potential · ` : ""}
                {a.updateAt ? `${a.updateBy ?? "Updated"} · ${developed(a.updateAt, timeZone)}`
                  : a.update === "no_status" ? (late ? `Overdue · due ${day(a.dueOn)}` : `Due by ${day(a.dueOn)}`) : "Not yet held"}
              </div>
            </div>
            <div className="lg:text-right">
              <UpdateStatus appt={a} carriers={carriers} open={opened === a.id} onOpenChange={(o) => setOpened(o ? a.id : null)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
