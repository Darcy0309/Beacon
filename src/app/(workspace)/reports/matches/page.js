import { notFound } from "next/navigation";
import { Combine } from "lucide-react";
import Link from "@/components/shared/intent-link";
import Topbar from "@/components/layout/topbar";
import SectionHeader from "@/components/shared/section-header";
import CsvButton from "@/components/shared/csv-button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import MatchResults from "@/features/matches/components/match-results";
import { getMatchResults, getMatchSummary } from "@/features/matches/queries";
import { goalFigures, matchReportCsv, monthsAhead } from "@/lib/match-report";
import { formatIso } from "@/lib/dates";
import { getBusinessToday } from "@/lib/server/business-day";
import { getCurrentUser } from "@/lib/server/session";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const day = (iso) => (iso ? formatIso(iso, "medium") : "—");

/**
 * The Match Tool's report (Sean, Nov 2026; the old system's match job): each active project's lead
 * goal, its leads, those owed and the share done, its matches (the names on its list we already
 * have elsewhere with a renewal date), how many renew in the next three months, the leads our
 * managers developed and the matches added since its start, and how far behind its Due Date it
 * runs. A project's matches open to be brought in. Administrators only.
 */
export default async function MatchReport() {
  const me = await getCurrentUser();
  if (me?.role !== "admin") notFound();
  const [rows, today, results] = await Promise.all([getMatchSummary(), getBusinessToday(), getMatchResults()]);
  const soon = monthsAhead(today).slice(0, 3);
  const soonLabel = `${soon[0].label}–${soon[2].label}`;

  return (
    <>
      <Topbar title="Match Tool" sub="The names on each project's list we already have elsewhere with a renewal date" />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Card data-match-report>
          <SectionHeader label="Matches by project" icon={Combine}
            action={<CsvButton csv={matchReportCsv(rows, today)} fileName={`Matches_${today}.csv`} disabled={!rows.length} data-export-matches />} />
          <MatchResults names={results.names} excluded={results.excluded} />
          <div className="overflow-x-auto">
            <Table className="min-w-[72rem] text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Project</TableHead>
                  {["Goal", "Leads", "Owed", "Done", "Matches", `Renew ${soonLabel}`, "Developed", "Matches added", "Start", "Due", "Days behind"].map((h) => (
                    <TableHead key={h} className="whitespace-normal text-right leading-tight">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const f = goalFigures({ goal: r.lead_goal, leads: r.leads, start: r.start_date, due: r.due_date, today });
                  const renewSoon = soon.reduce((n, m) => n + Number(r.by_month?.[m.key] ?? 0), 0);
                  return (
                    <TableRow key={r.project_id} data-match-row={r.project_id}>
                      <TableCell className="max-w-48 truncate" title={r.client}>{r.client ?? "—"}</TableCell>
                      <TableCell className="max-w-64 truncate font-medium" title={r.project}><Link href={`/projects/${r.project_id}`} className="hover:text-primary">{r.project}</Link></TableCell>
                      <TableCell className="text-right tabular-nums">{r.lead_goal?.toLocaleString() ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.leads.toLocaleString()}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", f.owed < 0 && "text-emerald-500")}>{f.owed?.toLocaleString() ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{f.pct == null ? "—" : `${f.pct}%`}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.matches ? (
                          <Link href={`/reports/matches/${r.project_id}`} className="rounded px-1.5 py-0.5 font-semibold text-primary transition-colors hover:bg-primary/10" data-match-link>
                            {r.matches.toLocaleString()}
                          </Link>
                        ) : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{renewSoon.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.developed.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.matched.toLocaleString()}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">{day(r.start_date)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">{day(r.due_date)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", f.behind > 0 && "font-semibold text-amber-500")}>{f.behind == null ? "—" : f.behind.toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {rows.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No active projects.</p> : null}
          </div>
          <p className="border-t border-[var(--panel-border)] px-5 py-2.5 text-xs text-muted-foreground">
            Leads: those the project has sent on or been given, matches among them. Developed and Matches added count from the project&apos;s start date. Days behind: against an even pace to its Due Date.
          </p>
        </Card>
      </div>
    </>
  );
}
