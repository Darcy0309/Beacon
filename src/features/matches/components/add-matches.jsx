"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Combine, Loader2 } from "lucide-react";
import Link from "@/components/shared/intent-link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addMatches } from "@/features/matches/actions";
import { LINE_LABELS } from "@/lib/carrier-report";
import { byRenewalMonth, monthsAhead, pickMatches } from "@/lib/match-report";
import { cn } from "@/lib/utils";

// The rows listed at most; the rest are still added.
const SHOWN = 300;
const LINES = [["pkg", "pkg_xdate", "pkg_carrier"], ["wc", "wc_xdate", "wc_carrier"], ["auto", "auto_xdate", "auto_carrier"], ["health", "health_xdate", "health_carrier"],
  ["prof", "prof_liab_xdate", "prof_liab_carrier"], ["do", "do_xdate", "do_carrier"], ["eo", "eo_xdate", "eo_carrier"], ["dental", "dental_xdate", "dental_provider"],
  ["vision", "vision_xdate", "vision_provider"], ["personal", "personal_lines_xdate", "personal_lines_carrier"], ["homeowner", "homeowner_xdate", "homeowner_carrier"],
  ["personal_auto", "personal_auto_xdate", "personal_auto_carrier"]];
const day = (iso) => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : "—");

/**
 * A project's matches (Sean, Nov 2026): picked by the months they renew in (each with how many),
 * so many of them, soonest first, brought to the DB Dev list at Viable-Staged with their renewal
 * dates, or on to the appointment project as leads at Lead-No Contact.
 */
export default function AddMatches({ projectId, isDbdev, hasAppt, matches, today }) {
  const router = useRouter();
  const [months, setMonths] = useState([]);
  const counts = useMemo(() => byRenewalMonth(matches), [matches]);
  const inMonths = useMemo(() => pickMatches(matches, months), [matches, months]);
  const [count, setCount] = useState("");
  const n = count === "" ? inMonths.length : Math.max(0, Math.min(inMonths.length, Number.parseInt(count, 10) || 0));
  const [to, setTo] = useState(isDbdev ? "dbdev" : "appt");
  const [pending, start] = useTransition();
  const picked = new Set(inMonths.slice(0, n).map((m) => m.lead_id));

  const toggle = (m) => { setMonths((now) => (now.includes(m) ? now.filter((x) => x !== m) : [...now, m])); setCount(""); };
  const add = () => start(async () => {
    const res = await addMatches(projectId, inMonths.slice(0, n).map((m) => m.lead_id), to);
    if (!res?.ok) return void toast.error(res?.error ?? "The matches weren't added.");
    const { added, skipped } = res.data;
    toast.success(`${added.toLocaleString()} match${added === 1 ? "" : "es"} added to ${to === "appt" ? "the appointment project as leads" : "DB Dev at Viable-Staged"}`,
      skipped ? { description: `${skipped} no longer a match, left as they were.` } : undefined);
    setMonths([]);
    setCount("");
    router.refresh();
  });

  return (
    <div data-add-matches>
      <div className="space-y-4 border-b border-[var(--panel-border)] px-5 py-4">
        <div>
          <div className="eyebrow mb-2">Renewing in <span className="normal-case tracking-normal text-muted-foreground">· pick months, or none for all</span></div>
          <div className="flex flex-wrap gap-1.5">
            {monthsAhead(today).map(({ month, label }) => {
              const on = months.includes(month);
              return (
                <button key={month} type="button" onClick={() => toggle(month)} aria-pressed={on} disabled={!counts[month]} data-match-month={month}
                  className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40",
                    on ? "border-primary bg-primary/15 text-primary" : "border-[var(--panel-border)] text-muted-foreground hover:border-primary/40 hover:text-primary")}>
                  {label} <span className="tabular-nums opacity-70">{(counts[month] ?? 0).toLocaleString()}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">Matches to add</span>
            <Input type="number" min={0} max={inMonths.length} value={count} placeholder={String(inMonths.length)} onChange={(e) => setCount(e.target.value)}
              className="h-9 w-28" aria-label="Matches to add" data-matches-to-add />
          </label>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="eyebrow mb-1.5">Add to</legend>
            <div className="flex flex-wrap gap-2">
              {[["dbdev", "DB Dev · Viable-Staged", isDbdev], ["appt", "Appt project · Lead-No Contact", hasAppt]].map(([key, label, can]) => (
                <label key={key} className={cn("flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors",
                  to === key ? "border-primary bg-primary/10 text-primary" : "border-[var(--panel-border)]", !can && "pointer-events-none opacity-40")}>
                  <input type="radio" name="to" value={key} checked={to === key} disabled={!can} onChange={() => setTo(key)} className="accent-[var(--primary)]" data-match-to={key} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <Button type="button" onClick={add} disabled={pending || !n} data-add-matches-go>
            {pending ? <Loader2 className="animate-spin" /> : <Combine />} Add {n.toLocaleString()} match{n === 1 ? "" : "es"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {to === "dbdev"
            ? "Their renewal dates go on the Liability, Work comp and Auto (and any other) lines, brought round to their next time; the Ultimate X-date stays blank for the lead managers."
            : "Each goes to the appointment project as a lead, with its renewal dates and Ultimate X-date, to the appointment manager with the fewest names."}
          {" "}Matches count toward the lead goal, never as developed, and nobody is paid for them.
        </p>
      </div>

      <div className="overflow-x-auto">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>Business</TableHead>
              <TableHead>City, ST</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Matched by</TableHead>
              <TableHead>Found on</TableHead>
              <TableHead>Renewal</TableHead>
              <TableHead>Lines</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inMonths.slice(0, SHOWN).map((m) => (
              <TableRow key={m.lead_id} data-match={m.lead_id} data-picked={picked.has(m.lead_id) || undefined} className={cn(!picked.has(m.lead_id) && "opacity-50")}>
                <TableCell className="font-medium"><Link href={`/leads/${m.lead_id}`} className="hover:text-primary">{m.company}</Link></TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{[m.city, m.state].filter(Boolean).join(", ") || "—"}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{m.phone || "—"}</TableCell>
                <TableCell className="capitalize">{m.matched_by}</TableCell>
                <TableCell className="max-w-56 truncate text-xs text-muted-foreground" title={`${m.source_client ?? ""} · ${m.source_project ?? ""}`}>
                  <Link href={`/leads/${m.source_lead_id}`} className="hover:text-primary">{m.source_client ?? "—"} · {m.source_project}</Link>
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{day(m.renewal)}</TableCell>
                <TableCell className="text-xs">
                  {LINES.filter(([, x]) => m.lines?.[x]).map(([key, x, c]) => `${LINE_LABELS[key]} ${day(m.lines[x]).slice(0, 5)}${m.lines[c] ? ` · ${m.lines[c]}` : ""}`).join("; ") || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {inMonths.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No matches{months.length ? " renewing then" : " for this project's list"}.</p> : null}
        {inMonths.length > SHOWN ? (
          <p className="border-t border-[var(--panel-border)] px-5 py-2.5 text-xs text-muted-foreground">The first {SHOWN} shown; all {n.toLocaleString()} chosen are added.</p>
        ) : null}
      </div>
    </div>
  );
}
