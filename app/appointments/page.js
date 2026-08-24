import Topbar from "@/components/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { appointments } from "@/lib/data";

function Appt({ a }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <span className={`h-11 w-1.5 shrink-0 rounded-full ${a.bar}`} />
        <div className="w-16 shrink-0 text-sm font-semibold tabular-nums">
          {a.time}
          <span className="block text-[0.62rem] font-normal text-muted-foreground">{a.ampm}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{a.co}</div>
          <div className="truncate text-sm text-muted-foreground">{a.detail}</div>
        </div>
        <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
          <span className="flex size-7 items-center justify-center rounded-full text-[0.6rem] font-semibold text-white" style={{ background: a.repC }}>{a.repI}</span>
          {a.rep}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AppointmentsPage() {
  return (
    <>
      <Topbar title="Appointments" sub="28 appointments scheduled this week" />
      <div className="flex-1 space-y-2 p-4 sm:p-6">
        <div>
          <h2 className="text-base font-semibold">This week</h2>
          <p className="text-sm text-muted-foreground">28 appointments scheduled · 6 awaiting confirmation</p>
        </div>

        <div className="pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Today — Tuesday, Aug 20</div>
        <div className="space-y-2.5">
          {appointments.today.map((a) => <Appt key={a.time} a={a} />)}
        </div>

        <div className="pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tomorrow — Wednesday, Aug 21</div>
        <div className="space-y-2.5">
          {appointments.tomorrow.map((a) => <Appt key={a.time} a={a} />)}
        </div>
      </div>
    </>
  );
}
