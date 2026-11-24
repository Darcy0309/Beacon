import { Sunrise } from "lucide-react";
import ToneBadge from "@/components/shared/tone-badge";
import { MIN_CALLS, clockOf, lengthOf, pct, rateOf, slowStart } from "@/lib/best-times";

const n = (v) => Number(v ?? 0);
const rateIn = (r, part) => rateOf({ calls: n(r[`${part}_calls`]), leads: n(r[`${part}_leads`]), appts: n(r[`${part}_appts`]) });

/**
 * Early Starts (Sean and Darcy, Nov 2026: "their average first-call time in the business's local time, how many calls
 * they make before 9 AM local and how those turn out, and how long from their first call to their first lead"): one
 * row a manager, earliest starter first; an early start converting at under half their later rate flagged.
 */
export default function EarlyStarts({ rows }) {
  return (
    <section className="rounded-xl border border-[var(--panel-border)] bg-card" data-early-starts>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--panel-border)] px-5 py-3">
        <Sunrise className="size-4 text-primary" aria-hidden />
        <p className="text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Early Starts</p>
        <p className="w-full text-xs text-muted-foreground">
          When each manager starts, in the business&apos;s local time; what their calls before 9 AM bring in against their calls after; and how long from their first call of the day to their first lead.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[0.66rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              <th className="px-5 py-2">Manager</th>
              <th className="px-3 py-2 text-right">Days</th>
              <th className="px-3 py-2 text-right">First call (avg)</th>
              <th className="px-3 py-2 text-right">Calls before 9</th>
              <th className="px-3 py-2 text-right">Leads · appts before 9</th>
              <th className="px-3 py-2 text-right">Before 9</th>
              <th className="px-3 py-2 text-right">After 9</th>
              <th className="px-5 py-2 text-right">First call → first lead</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const slow = slowStart(r);
              const early = n(r.early_calls) >= MIN_CALLS ? rateIn(r, "early") : null;
              const later = n(r.later_calls) >= MIN_CALLS ? rateIn(r, "later") : null;
              return (
                <tr key={r.user_id} className="border-t border-[var(--panel-border)]" data-early-row={r.user_id}>
                  <td className="px-5 py-2.5">
                    <span className="font-medium">{r.name}</span>
                    {slow ? <span className="ml-2" data-slow-start><ToneBadge tone="amber">Slow start</ToneBadge></span> : null}
                  </td>
                  <td className="px-3 py-2.5 text-right">{n(r.days)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold" data-first-call>{clockOf(r.avg_first_minute)}</td>
                  <td className="px-3 py-2.5 text-right">{n(r.early_calls).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right">{n(r.early_leads)} · {n(r.early_appts)}</td>
                  <td className={`px-3 py-2.5 text-right font-semibold ${slow ? "text-amber-600 dark:text-amber-400" : ""}`} data-early-rate>
                    {early == null ? <span className="font-normal text-muted-foreground" title={`Fewer than ${MIN_CALLS} calls`}>—</span> : pct(early)}
                  </td>
                  <td className="px-3 py-2.5 text-right" data-later-rate>{later == null ? <span className="text-muted-foreground">—</span> : pct(later)}</td>
                  <td className="px-5 py-2.5 text-right" data-to-lead>
                    {n(r.lead_days) ? <>{lengthOf(r.avg_minutes_to_lead)}<span className="block text-xs text-muted-foreground">on {n(r.lead_days)} day{n(r.lead_days) === 1 ? "" : "s"} with a lead</span></>
                      : <span className="text-muted-foreground">No leads yet</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="px-5 py-4 text-sm text-muted-foreground">No calls in these days with these filters.</p> : null}
      </div>
      <p className="border-t border-[var(--panel-border)] px-5 py-2.5 text-xs text-muted-foreground">
        Slow start: {MIN_CALLS}+ calls before 9 AM converting at under half the rate of that manager&apos;s calls after 9. A rate shows once there are {MIN_CALLS} calls.
      </p>
    </section>
  );
}
