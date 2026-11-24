import Link from "@/components/shared/intent-link";
import { ArrowRight, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import SectionHeader from "@/components/shared/section-header";
import { DAY_NAMES, MIN_CALLS, bestSpan, hourSpan, pct, rateOf, weekOf, windows } from "@/lib/best-times";

/**
 * Best Times to Call on a project's page (Darcy, Nov 2026): its best hours and the ones to avoid, by day and hour in
 * the business's local time, from the project's last year of calls; a new project's from its industry's. Leads and
 * appointments together. `data`: getProjectBestTimes().
 */
export default function ProjectBestTimes({ projectId, data }) {
  const week = weekOf(data.rows);
  const { best, worst } = windows(week);
  const span = bestSpan(week);
  const industry = data.basis === "industry";
  const report = `/reports/heat-map?${industry ? `sic=${data.sic}` : `project=${projectId}`}&from=${data.from}&to=${data.to}`;
  const basis = !week.total.calls ? "No calls on this project in the last year yet."
    : `From ${week.total.calls.toLocaleString()} calls in the last year${industry ? ` to businesses in this project's industry (SIC ${data.sic}), as it's new` : " on this project"} · ${pct(rateOf(week.total))} became leads or appointments · in each business's local time`;

  const line = (c, tone) => (
    <li key={`${c.dow}-${c.hour}`} className="flex items-baseline justify-between gap-3 py-1.5" data-best-hour={`${c.dow}-${c.hour}`}>
      <span>
        <span className="font-medium">{DAY_NAMES[c.dow - 1]} {hourSpan(c.hour)}</span>
        <span className="ml-2 text-xs text-muted-foreground tabular-nums">{c.calls.toLocaleString()} calls</span>
      </span>
      <span className={`font-bold tabular-nums ${tone}`}>{pct(c.rate)}</span>
    </li>
  );

  return (
    <Card data-project-best-times={data.basis}>
      <SectionHeader label="Best Times to Call" icon={Clock}
        action={week.total.calls ? (
          <Link href={report} className="flex items-center gap-1 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-primary transition-opacity hover:opacity-75" data-best-times-report>
            Heat map <ArrowRight className="size-3" />
          </Link>
        ) : null} />
      <div className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground tabular-nums" data-best-basis>{basis}</p>
        {best.length ? (
          <>
            {span ? (
              <p className="text-sm" data-best-span>
                Best two hours on weekdays: <b>Mon–Fri, {hourSpan(span.hour, 2)}</b> <span className="text-muted-foreground tabular-nums">({pct(span.rate)})</span>
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div data-best-top>
                <p className="eyebrow mb-1 text-emerald-600 dark:text-emerald-400">Best hours</p>
                <ol className="divide-y divide-[var(--panel-border)] text-sm">{best.map((c) => line(c, "text-emerald-600 dark:text-emerald-400"))}</ol>
              </div>
              <div data-best-avoid>
                <p className="eyebrow mb-1 text-rose-600 dark:text-rose-400">Hours to avoid</p>
                {worst.length ? <ol className="divide-y divide-[var(--panel-border)] text-sm">{worst.map((c) => line(c, "text-rose-600 dark:text-rose-400"))}</ol>
                  : <p className="py-1.5 text-sm text-muted-foreground">Not enough hours to compare yet.</p>}
              </div>
            </div>
          </>
        ) : week.total.calls ? (
          <p className="text-sm text-muted-foreground" data-best-thin>Not enough calls yet to judge an hour: each needs {MIN_CALLS}.</p>
        ) : null}
      </div>
    </Card>
  );
}
