import { UsersRound } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";
import { colorFor, initialsOf } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Daily Team Production (row three of the manager's dashboard): every
 * active account manager, started or not, with the leads and appointments
 * they have developed today, most first. `rows`: getTeamProduction().
 */
export default function TeamProductionCard({ rows, meId, dayLabel, meLabel = "you" }) {
  const most = Math.max(1, ...rows.map((r) => r.leads + r.appts));
  const total = (key) => rows.reduce((n, r) => n + r[key], 0);
  return (
    <Card data-team-production>
      <SectionHeader wrap label="Daily Team Production" icon={UsersRound}
        action={<span className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground">{dayLabel}</span>} />
      <div className="flex items-center justify-end gap-4 px-4 pt-3 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <span className="w-10 text-right">Leads</span>
        <span className="w-10 text-right">Appts</span>
      </div>
      <ul className="space-y-1 px-2 pb-2 pt-1">
        {rows.map((r) => {
          const me = r.userId === meId;
          return (
            <li key={r.userId} data-team-row={r.userId}
              className={cn("relative flex items-center gap-3 overflow-hidden rounded-lg px-2 py-2", me && "bg-primary/8 ring-1 ring-primary/30")}>
              {/* How far along the day's leaders each one is, behind the row. */}
              <span aria-hidden className="absolute inset-y-0 left-0 bg-primary/5" style={{ width: `${((r.leads + r.appts) / most) * 100}%` }} />
              <span className="relative flex size-7 shrink-0 items-center justify-center rounded-md text-[0.6rem] font-bold text-white" style={{ background: colorFor(r.name) }}>
                {initialsOf(r.name)}
              </span>
              <span className="relative min-w-0 flex-1 truncate text-sm font-medium">
                {r.name}{me && meLabel ? <span className="ml-1.5 text-xs font-normal text-primary">{meLabel}</span> : null}
              </span>
              <span className={cn("relative w-10 text-right text-sm font-semibold tabular-nums", !r.leads && "text-muted-foreground")} style={r.leads ? { color: "var(--neon-cyan)" } : undefined}>{r.leads}</span>
              <span className={cn("relative w-10 text-right text-sm font-semibold tabular-nums", !r.appts && "text-muted-foreground")} style={r.appts ? { color: "var(--neon-emerald)" } : undefined}>{r.appts}</span>
            </li>
          );
        })}
        {rows.length === 0 ? <li className="py-6 text-center text-sm text-muted-foreground">No account managers yet.</li> : null}
      </ul>
      {rows.length ? (
        <div className="flex items-center justify-end gap-4 border-t border-[var(--panel-border)] px-4 py-2.5 text-sm font-semibold">
          <span className="flex-1 text-xs uppercase tracking-[0.1em] text-muted-foreground">Team today</span>
          <span className="w-10 text-right tabular-nums">{total("leads")}</span>
          <span className="w-10 text-right tabular-nums">{total("appts")}</span>
        </div>
      ) : null}
    </Card>
  );
}
