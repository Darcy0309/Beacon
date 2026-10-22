"use client";

import { Download, Users } from "lucide-react";
import Link from "@/components/shared/intent-link";
import TipLayer from "@/components/shared/tip-layer";
import { MONTH_SHORT, STALE_DAYS, pipelineCsv, stale } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

const TH = "px-2 py-2 text-left text-[0.62rem] font-bold uppercase tracking-[0.1em] text-muted-foreground whitespace-nowrap";
const TD = "px-2 py-2 align-top";
const money = (n) => (n == null ? "—" : `$${Number(n) % 1 ? Number(n).toFixed(2) : Number(n)}`);
const mdy = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(2, 4)}` : "—");

/**
 * The Pipeline Report (Sean, Oct 2026): for each project and manager, the
 * names renewing in the months counted, as the X-Dates chart splits them,
 * with the manager's last appointment set and last call on it (red when
 * that is more than STALE_DAYS days ago, or never), this month's calls, the
 * pay (an appointment's, or a lead's) and special pay (confirmation pay, or a
 * DB dev project's Special Pay at its goal), the client's Sales Rep, the conversion (appointments of all), and how
 * many other managers share the project (their names on hover). Exported in
 * the columns of Sean's sample.
 *
 *   rows       getPipelineReport()
 *   months     the months counted, in the order they come up
 *   linkTo     where a project's name goes: "project" (its page) or "work" (a manager's call list on it)
 *   fileName   the export's name
 */
export default function PipelineReport({ rows, months, today, linkTo = "project", fileName }) {
  const projectHref = (r) => (linkTo === "work" ? `/work/${r.projectId}` : `/projects/${r.projectId}`);
  const download = () => {
    const url = URL.createObjectURL(new Blob([`﻿${pipelineCsv(rows, months)}\r\n`], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const sum = (key) => rows.reduce((n, r) => n + (r[key] ?? 0), 0);
  const total = sum("total");
  // Who shares each project, shown over the page on hover so the table's edge never cuts the list off.
  const tips = Object.fromEntries(rows.filter((r) => r.sharedWith.length)
    .map((r) => [`shared-${r.key}`, { title: "Shared with", rows: r.sharedWith.map((n) => ({ key: n, label: n, value: "" })) }]));

  return (
    <div data-pipeline-report>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--panel-border)] px-5 py-2.5 text-xs text-muted-foreground">
        <span>
          {rows.length.toLocaleString()} row{rows.length === 1 ? "" : "s"} · renewing in {months.map((m) => MONTH_SHORT[m - 1]).join(", ")}
          {" · "}<span className="text-rose-400">red</span>: no call on it in {STALE_DAYS}+ days
        </span>
        <button type="button" onClick={download} disabled={!rows.length} data-export-pipeline
          className="flex items-center gap-1.5 rounded-md border border-[var(--panel-border)] px-2.5 py-1 text-[0.66rem] font-bold uppercase tracking-[0.12em] transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50">
          <Download className="size-3.5" /> Export CSV
        </button>
      </div>
      {rows.length ? (
        <TipLayer tips={tips} className="overflow-x-auto">
          <table className="w-full min-w-[72rem] text-xs">
            <thead>
              <tr className="border-b border-[var(--panel-border)]">
                <th className={TH}>Project</th><th className={TH}>TZ</th><th className={TH}>ST</th><th className={TH}>Manager</th>
                <th className={TH}>Last appt set</th><th className={TH}>Last worked</th><th className={cn(TH, "text-right")} title="Their calls on it this month">Calls</th>
                {months.map((m) => <th key={m} className={cn(TH, "text-right")}>{MONTH_SHORT[m - 1]}</th>)}
                <th className={cn(TH, "text-right")}>Total</th><th className={cn(TH, "text-right")}>Appts</th><th className={cn(TH, "text-right")}>Off list</th>
                <th className={cn(TH, "text-right")}>Viable left</th><th className={cn(TH, "text-right")}>Pay</th><th className={cn(TH, "text-right")} title="Confirmation pay on an appointment project; on a DB dev project, its Special Pay a lead at its goal">Special</th>
                <th className={TH}>Sales Rep</th><th className={cn(TH, "text-right")}>Conv%</th><th className={cn(TH, "text-center")}>Shared</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--panel-border)]">
              {rows.map((r) => {
                const behind = stale(r.lastWorkedDay, today);
                return (
                  <tr key={r.key} data-pipeline-row={r.key} data-stale={behind || undefined} className={cn("hover:bg-muted/30", behind && "bg-rose-500/[0.06]")}>
                    <td className={cn(TD, "max-w-72")}>
                      <Link href={projectHref(r)} className="font-medium break-words hover:text-primary hover:underline" data-pipeline-project={r.projectId}>{r.project}</Link>
                    </td>
                    <td className={cn(TD, "text-muted-foreground")}>{r.timeZone ?? "—"}</td>
                    <td className={cn(TD, "text-muted-foreground")}>{r.state ?? "—"}</td>
                    <td className={cn(TD, "whitespace-nowrap font-medium")}>{r.manager}</td>
                    <td className={cn(TD, "tabular-nums")}>{mdy(r.lastApptSet)}</td>
                    <td className={cn(TD, "tabular-nums", behind ? "font-semibold text-rose-400" : "")} data-last-worked>{r.lastWorkedDay ? mdy(r.lastWorkedDay) : "Never"}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{r.calls.toLocaleString()}</td>
                    {months.map((m) => <td key={m} className={cn(TD, "text-right tabular-nums")}>{(r.months[m] ?? 0).toLocaleString()}</td>)}
                    <td className={cn(TD, "text-right font-semibold tabular-nums")}>{r.total.toLocaleString()}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{r.appts.toLocaleString()}</td>
                    <td className={cn(TD, "text-right tabular-nums text-muted-foreground")}>{r.offList.toLocaleString()}</td>
                    <td className={cn(TD, "text-right tabular-nums text-primary")}>{r.viableLeft.toLocaleString()}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{money(r.pay)}</td>
                    <td className={cn(TD, "text-right tabular-nums")} data-special>
                      {money(r.specialPay)}
                      {r.specialGoal ? <span className="block text-[0.62rem] text-muted-foreground">at {r.specialGoal} leads</span> : null}
                    </td>
                    <td className={cn(TD, "whitespace-nowrap")}>{r.salesRep ?? "—"}</td>
                    <td className={cn(TD, "text-right font-semibold tabular-nums")}>{r.conversion}%</td>
                    <td className={cn(TD, "text-center")}>
                      {/* How many share it; their names on hover (or focus), to keep the row short. */}
                      {r.sharedWith.length ? (
                        <span tabIndex={0} data-tip={`shared-${r.key}`} data-shared={r.sharedWith.length}
                          className="inline-flex cursor-default items-center gap-1 rounded-full border border-[var(--panel-border)] px-2 py-0.5 tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <Users className="size-3" />{r.sharedWith.length}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 font-semibold">
                <td className={TD} colSpan={7}>All rows</td>
                {months.map((m) => <td key={m} className={cn(TD, "text-right tabular-nums")}>{rows.reduce((n, r) => n + (r.months[m] ?? 0), 0).toLocaleString()}</td>)}
                <td className={cn(TD, "text-right tabular-nums")}>{total.toLocaleString()}</td>
                <td className={cn(TD, "text-right tabular-nums")}>{sum("appts").toLocaleString()}</td>
                <td className={cn(TD, "text-right tabular-nums")}>{sum("offList").toLocaleString()}</td>
                <td className={cn(TD, "text-right tabular-nums")}>{sum("viableLeft").toLocaleString()}</td>
                <td className={TD} colSpan={3} />
                <td className={cn(TD, "text-right tabular-nums")}>{total ? Math.round((sum("appts") / total) * 100) : 0}%</td>
                <td className={TD} />
              </tr>
            </tbody>
          </table>
        </TipLayer>
      ) : (
        <p className="p-8 text-center text-sm text-muted-foreground">No names renewing in these months match these filters.</p>
      )}
    </div>
  );
}
