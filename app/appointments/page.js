import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import AppointmentForm from "@/components/appointment-form";
import { Card, CardContent } from "@/components/ui/card";
import { getAppointments, getLookups, getLeads } from "@/lib/queries";
import { colorFor, initials, shortName, splitTime } from "@/lib/display";
import { STATUS_BAR, APPT_TONE } from "@/lib/constants";

export const dynamic = "force-dynamic";

const isoDay = (d) => d.toISOString().slice(0, 10);

function Appt({ a }) {
  const { time, ampm } = splitTime(a.appt_time);
  const rep = a.rep_name || shortName(a.user);
  const code = a.lead?.status?.code || "new";

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <span className={`h-11 w-1.5 shrink-0 rounded-full ${STATUS_BAR[code] || STATUS_BAR.new}`} />
        <div className="w-16 shrink-0 text-sm font-semibold tabular-nums">
          {time}
          <span className="block text-[0.62rem] font-normal text-muted-foreground">{ampm}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{a.lead?.company_name ?? "—"}</div>
          <div className="truncate text-sm text-muted-foreground">
            {[a.lead?.status?.name, a.lead?.contact_name, `${a.duration_min ?? 30} min`]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        {a.status ? (
          <ToneBadge tone={APPT_TONE[a.status.name] ?? "slate"} className="hidden sm:inline-flex">
            {a.status.name}
          </ToneBadge>
        ) : null}
        <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
          <span
            className="flex size-7 items-center justify-center rounded-full text-[0.6rem] font-semibold text-white"
            style={{ background: colorFor(rep) }}
          >
            {initials(rep)}
          </span>
          {rep}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function AppointmentsPage() {
  const today = new Date();
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 6);

  const [appts, options, leads] = await Promise.all([
    getAppointments({ from: isoDay(today), to: isoDay(weekEnd) }),
    getLookups(),
    getLeads({ limit: 300 }),
  ]);

  // Group by date, preserving chronological order.
  const groups = new Map();
  for (const a of appts) {
    if (!groups.has(a.appt_date)) groups.set(a.appt_date, []);
    groups.get(a.appt_date).push(a);
  }

  const awaiting = appts.filter((a) => a.status?.name === "Scheduled").length;
  const label = (iso) => {
    const d = new Date(`${iso}T00:00:00`);
    const t = isoDay(today);
    const tm = new Date(today);
    tm.setDate(today.getDate() + 1);
    const prefix = iso === t ? "Today — " : iso === isoDay(tm) ? "Tomorrow — " : "";
    return prefix + d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  };

  return (
    <>
      <Topbar title="Appointments" sub={`${appts.length} appointments scheduled this week`} />
      <div className="flex-1 space-y-2 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">This week</h2>
            <p className="text-sm text-muted-foreground">
              {appts.length} appointments scheduled · {awaiting} awaiting confirmation
            </p>
          </div>
          <AppointmentForm options={options} leads={leads} />
        </div>

        {groups.size === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No appointments scheduled in the next 7 days.
            </CardContent>
          </Card>
        )}

        {[...groups.entries()].map(([date, rows]) => (
          <div key={date}>
            <div className="pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {label(date)}
            </div>
            <div className="mt-2 space-y-2.5">
              {rows.map((a) => (
                <Appt key={a.id} a={a} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
