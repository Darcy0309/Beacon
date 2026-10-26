import { ChevronLeft, ChevronRight, Timer } from "lucide-react";
import Link from "@/components/shared/intent-link";
import Topbar from "@/components/layout/topbar";
import SectionHeader from "@/components/shared/section-header";
import ParamSelect from "@/components/shared/param-select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import HourlyDayPicker from "@/features/reports/components/hourly-day-picker";
import { getHourlyProgress } from "@/features/reports/queries";
import { getAssignableStaff } from "@/features/users/queries";
import { getBusinessTimeZone, getBusinessToday } from "@/lib/server/business-day";
import { getCurrentUser } from "@/lib/server/session";
import { addDays, formatIso, isIsoDate } from "@/lib/dates";
import { clockOf } from "@/lib/project-calendar";

export const dynamic = "force-dynamic";

// The working day the chart always shows (6 AM to 7 PM), widened for any hour worked outside it.
const FIRST_HOUR = 6;
const LAST_HOUR = 19;
const hourLabel = (h) => `${((h + 11) % 12) + 1}${h < 12 ? "a" : "p"}`;

/**
 * Hourly Progress (the old AE hourly progress report): one person's day by
 * the hour, calls made as bars with the leads and appointments in each hour,
 * their first and last call, and the month so far. Administrators and
 * managers pick anyone on staff; an agent sees their own.
 */
export default async function HourlyProgress({ searchParams }) {
  const sp = await searchParams;
  const [me, today, tz] = await Promise.all([getCurrentUser(), getBusinessToday(), getBusinessTimeZone()]);
  const canPick = me?.role === "admin" || me?.role === "manager";
  const staff = canPick ? await getAssignableStaff() : [];
  const userId = canPick && /^[1-9]\d{0,17}$/.test(sp?.user ?? "") && staff.some((u) => String(u.id) === sp.user) ? Number(sp.user) : me.id;
  const day = isIsoDate(sp?.day) && sp.day <= today ? sp.day : today;
  const data = await getHourlyProgress({ userId, day });
  const who = canPick ? staff.find((u) => u.id === userId)?.name ?? "Me" : "Me";

  const worked = data.hours.map((h) => h.hour);
  const from = Math.min(FIRST_HOUR, ...worked);
  const to = Math.max(LAST_HOUR, ...worked);
  const byHour = Object.fromEntries(data.hours.map((h) => [h.hour, h]));
  const hours = Array.from({ length: to - from + 1 }, (_, i) => byHour[from + i] ?? { hour: from + i, calls: 0, leads: 0, appointments: 0 });
  const top = Math.max(1, ...hours.map((h) => h.calls));
  const total = hours.reduce((t, h) => ({ calls: t.calls + h.calls, leads: t.leads + h.leads, appointments: t.appointments + h.appointments }), { calls: 0, leads: 0, appointments: 0 });
  const busy = hours.filter((h) => h.calls).length;
  const time = (iso) => (iso ? new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "—");
  const link = (d) => `/reports/hourly?${new URLSearchParams({ ...(canPick ? { user: String(userId) } : {}), day: d })}`;

  const figures = [
    // The chart's own colours (globals.css: --hourly-*), so the figures match their bars.
    ["Calls", total.calls, "var(--hourly-calls)"],
    ["Leads", total.leads, "var(--hourly-leads)"],
    ["Appointments", total.appointments, "var(--hourly-appts)"],
    ["Calls an hour", busy ? (total.calls / busy).toFixed(1) : "0", "var(--neon-amber)", `over ${busy} hour${busy === 1 ? "" : "s"} with calls`],
  ];

  return (
    <>
      <Topbar title="Hourly Progress" sub={`${who} · ${formatIso(day, "long")}`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Card>
          <SectionHeader wrap label="Hourly Progress" icon={Timer}
            action={canPick ? <ParamSelect name="user" label="Person" placeholder="Me" value={String(userId)} options={staff.map((u) => ({ value: String(u.id), label: `${u.name} · ${u.role}` }))} /> : null} />
          <div className="space-y-5 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild size="icon" variant="outline"><Link href={link(addDays(day, -1))} aria-label="The day before"><ChevronLeft /></Link></Button>
              <HourlyDayPicker day={day} today={today} />
              {day < today ? <Button asChild size="icon" variant="outline"><Link href={link(addDays(day, 1))} aria-label="The day after"><ChevronRight /></Link></Button> : null}
              {day !== today ? <Link href={link(today)} className="text-xs font-semibold uppercase tracking-[0.1em] text-primary hover:underline">Today</Link> : null}
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {figures.map(([label, value, color, note]) => (
                <div key={label} className="rounded-lg border border-[var(--panel-border)] px-3 py-2" data-hourly-figure={label}>
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="text-xl font-bold tabular-nums" style={{ color }}>{typeof value === "number" ? value.toLocaleString() : value}</div>
                  <div className="text-[0.7rem] text-muted-foreground">{note ?? (day === today ? "today" : "that day")}</div>
                </div>
              ))}
            </div>

            {/* Calls each hour, the leads and appointments in it on top. */}
            <div data-hourly-chart>
              <div className="flex h-56 items-end gap-1 border-b border-[var(--panel-border)] sm:gap-1.5">
                {hours.map((h) => (
                  <div key={h.hour} className="group relative flex h-full flex-1 flex-col items-center justify-end" data-hour={h.hour} data-calls={h.calls}
                    title={`${clockOf(h.hour * 60)} – ${clockOf((h.hour + 1) * 60 % 1440)}: ${h.calls} call${h.calls === 1 ? "" : "s"}, ${h.leads} lead${h.leads === 1 ? "" : "s"}, ${h.appointments} appointment${h.appointments === 1 ? "" : "s"}`}>
                    {h.calls ? <span className="mb-0.5 text-[0.62rem] font-semibold tabular-nums text-muted-foreground">{h.calls}</span> : null}
                    <div className="flex w-full flex-col justify-end overflow-hidden rounded-t-md bg-[var(--hourly-calls)]/70 transition-opacity group-hover:opacity-80"
                      style={{ height: `${(h.calls / top) * 85}%`, minHeight: h.leads || h.appointments ? 8 : 0 }}>
                      {h.appointments ? <div className="w-full bg-[var(--hourly-appts)]" style={{ height: 4 * h.appointments, maxHeight: "50%" }} /> : null}
                      {h.leads ? <div className="w-full bg-[var(--hourly-leads)]" style={{ height: 4 * h.leads, maxHeight: "50%" }} /> : null}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-1 flex gap-1 sm:gap-1.5">
                {hours.map((h) => <span key={h.hour} className="flex-1 text-center text-[0.6rem] text-muted-foreground">{hourLabel(h.hour)}</span>)}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--hourly-calls)]/70" /> Calls</span>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--hourly-leads)]" /> Leads</span>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--hourly-appts)]" /> Appointments</span>
                <span className="ml-auto">{total.calls ? `First call ${time(data.first)} · last ${time(data.last)}` : "No calls this day."}</span>
              </div>
            </div>

            <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm" data-hourly-month>
              <span className="font-semibold">{formatIso(day, "month")} so far:</span>{" "}
              <span className="tabular-nums">{data.month.calls.toLocaleString()} calls · {data.month.leads.toLocaleString()} leads · {data.month.appointments.toLocaleString()} appointments</span>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
