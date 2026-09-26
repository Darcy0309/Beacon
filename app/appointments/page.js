import { CalendarClock, CalendarCheck, Clock, CheckCheck } from "lucide-react";
import Topbar from "@/components/topbar";
import StatTile from "@/components/stat-tile";
import SectionHeader from "@/components/section-header";
import AppointmentForm from "@/components/appointment-form";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getWeekAppointments, getLookups, getLeadOptions } from "@/lib/queries";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  Scheduled: "var(--neon-cyan)",
  Confirmed: "var(--neon-emerald)",
  Held: "var(--neon-violet)",
  Rescheduled: "var(--neon-amber)",
  Cancelled: "var(--neon-rose)",
  "No Show": "var(--muted-foreground)",
};

function Appt({ a }) {
  const tone = STATUS_TONE[a.status] ?? "var(--neon-cyan)";
  return (
    <div data-list-row className="flex items-center gap-4 border-b border-[var(--panel-border)] px-5 py-3.5 last:border-0">
      <span className={`h-10 w-[3px] shrink-0 rounded-full ${a.bar}`} />
      <div className="w-16 shrink-0 text-sm font-bold tabular-nums">
        {a.time}
        <span className="block text-[0.58rem] font-semibold tracking-[0.1em] text-muted-foreground">{a.ampm}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{a.co}</div>
        <div className="truncate text-xs text-muted-foreground">{a.detail}</div>
      </div>
      {/* Fixed-width columns: "Held" and "Confirmed" are different lengths, as
          are rep names, and without a set width each row pushed the pill and
          the avatar to a different place. */}
      <div className="hidden w-32 shrink-0 justify-center sm:flex">
        <span
          className="inline-flex rounded-full border px-2.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.12em]"
          style={{
            borderColor: `color-mix(in srgb, ${tone} 45%, transparent)`,
            background: `color-mix(in srgb, ${tone} 8%, transparent)`,
            color: tone,
          }}
        >
          {a.status}
        </span>
      </div>
      <div className="hidden w-44 shrink-0 items-center gap-2 text-sm text-muted-foreground md:flex">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-[0.6rem] font-bold text-white" style={{ background: a.repC }}>
          {a.repI}
        </span>
        <span className="truncate" title={a.rep}>{a.rep}</span>
      </div>
    </div>
  );
}

export default async function AppointmentsPage() {
  const [{ rows, groups }, options, leads] = await Promise.all([
    getWeekAppointments(),
    getLookups(),
    getLeadOptions(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = rows.filter((a) => a.date === today).length;
  const confirmed = rows.filter((a) => a.status === "Confirmed").length;
  const awaiting = rows.filter((a) => a.status === "Scheduled").length;

  // Per-day counts for the sparklines.
  const perDay = groups.map(([, list]) => list.length);

  const tiles = [
    { label: "This Week", value: String(rows.length), note: "appointments scheduled",
      icon: CalendarClock, accent: "var(--neon-cyan)", series: perDay, bars: true },
    { label: "Today", value: String(todayCount), note: "on the calendar",
      icon: Clock, accent: "var(--neon-amber)", series: perDay },
    { label: "Confirmed", value: String(confirmed), note: "ready to run",
      icon: CheckCheck, accent: "var(--neon-emerald)", series: perDay },
    { label: "Awaiting Confirmation", value: String(awaiting), note: "need a follow-up call",
      icon: CalendarCheck, accent: "var(--neon-violet)", series: perDay, bars: true },
  ];

  const label = (iso) => {
    const d = new Date(`${iso}T00:00:00`);
    const t = new Date(); const tm = new Date(); tm.setDate(t.getDate() + 1);
    const prefix = iso === today ? "Today — " : iso === tm.toISOString().slice(0, 10) ? "Tomorrow — " : "";
    return prefix + d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  };

  return (
    <>
      <Topbar title="Appointments" sub={`${rows.length} appointments scheduled this week`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        <Card>
          <SectionHeader
            label="This Week's Schedule"
            icon={CalendarClock}
            action={
              <AppointmentForm
                options={options}
                leads={leads}
                trigger={<Button size="sm"><CalendarClock /> New appointment</Button>}
              />
            }
          />
          {groups.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No appointments scheduled in the next 7 days.
            </p>
          )}
          {groups.map(([date, list]) => (
            <div key={date}>
              <div className="border-b border-[var(--panel-border)] bg-secondary/40 px-5 py-2">
                <span className="eyebrow">{label(date)}</span>
                <span className="ml-2 text-[0.66rem] font-semibold tabular-nums text-primary">{list.length}</span>
              </div>
              {list.map((a) => <Appt key={a.id} a={a} />)}
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}
