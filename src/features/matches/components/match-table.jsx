"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from "lucide-react";
import Link from "@/components/shared/intent-link";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

// The columns, and how each sorts: text A–Z, figures high to low first (Sean: "owed (high/low), done %
// (high/low), matches (high/low)").
const COLUMNS = [
  { key: "client", label: "Client", text: true },
  { key: "project", label: "Project", text: true },
  { key: "goal", label: "Goal" },
  { key: "leads", label: "Leads" },
  { key: "owed", label: "Owed" },
  { key: "pct", label: "Done" },
  { key: "matches", label: "Matches" },
  { key: "renew", label: "Renew" },
  { key: "developed", label: "Developed" },
  { key: "matched", label: "Matches added" },
  { key: "start", label: "Start", date: true },
  { key: "due", label: "Due", date: true },
  { key: "behind", label: "Days behind" },
];
const NO_REP = "__none";

/**
 * The Match Tool's projects (Sean, Nov 2026: "This list of projects is going to get very big"): a search
 * of client and project names, a Client and a Sales Rep to show, and every column sorted by clicking its
 * heading (or from Sort by), each way. The headings stay at the top as the list scrolls.
 *
 * `rows`: [{ id, client, project, rep, goal, leads, owed, pct, matches, renew, developed, matched, start, due,
 * startLabel, dueLabel, behind }]; `renewLabel`: the Renew column's months ("Dec–Mar").
 */
export default function MatchTable({ rows, renewLabel }) {
  const [q, setQ] = useState("");
  const [client, setClient] = useState("");
  const [rep, setRep] = useState("");
  const [sort, setSort] = useState({ key: "client", dir: "asc" });

  const clients = useMemo(() => [...new Set(rows.map((r) => r.client).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rows]);
  const reps = useMemo(() => [...new Set(rows.map((r) => r.rep).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rows]);

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = rows.filter((r) => (!client || r.client === client)
      && (!rep || (rep === NO_REP ? !r.rep : r.rep === rep))
      && words.every((w) => `${r.client ?? ""} ${r.project ?? ""}`.toLowerCase().includes(w)));
    const col = COLUMNS.find((c) => c.key === sort.key);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      // Nothing to sort by (no goal, no date): last, whichever way.
      if (x == null || x === "") return y == null || y === "" ? a.project.localeCompare(b.project) : 1;
      if (y == null || y === "") return -1;
      const by = col?.text || col?.date ? String(x).localeCompare(String(y)) : x - y;
      return by * dir || a.project.localeCompare(b.project);
    });
  }, [rows, q, client, rep, sort]);

  const sortBy = (key) => {
    const col = COLUMNS.find((c) => c.key === key);
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: col?.text || col?.date ? "asc" : "desc" }));
  };
  const filtered = q || client || rep;

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--panel-border)] px-5 py-3" data-match-filters>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients and projects" aria-label="Search clients and projects"
            className="w-64 pl-8" data-match-search />
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold">
          Client
          <Select value={client} onChange={(e) => setClient(e.target.value)} aria-label="Filter by client" className="w-56" data-match-client>
            <option value="">All clients</option>
            {clients.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold">
          Sales Rep
          <Select value={rep} onChange={(e) => setRep(e.target.value)} aria-label="Filter by Sales Rep" className="w-48" data-match-rep>
            <option value="">Everyone</option>
            {reps.map((r) => <option key={r} value={r}>{r}</option>)}
            <option value={NO_REP}>No Sales Rep</option>
          </Select>
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold">
          Sort by
          <Select value={`${sort.key}:${sort.dir}`} onChange={(e) => { const [key, dir] = e.target.value.split(":"); setSort({ key, dir }); }}
            aria-label="Sort by" className="w-52" data-match-sort>
            {COLUMNS.flatMap((c) => {
              const name = c.key === "renew" ? `Renew ${renewLabel}` : c.label;
              return c.text ? [[`${c.key}:asc`, `${name}: A–Z`], [`${c.key}:desc`, `${name}: Z–A`]]
                : c.date ? [[`${c.key}:asc`, `${name}: earliest`], [`${c.key}:desc`, `${name}: latest`]]
                : [[`${c.key}:desc`, `${name}: high to low`], [`${c.key}:asc`, `${name}: low to high`]];
            }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </label>
        {filtered ? (
          <button type="button" onClick={() => { setQ(""); setClient(""); setRep(""); }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" data-match-clear>
            <X className="size-3.5" /> Clear
          </button>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums" data-match-count>
          {shown.length.toLocaleString()}{filtered ? ` of ${rows.length.toLocaleString()}` : ""} project{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Its own scroll, so the headings stay in view down a long list (Sean, Nov 2026: "have this header lock"). */}
      <div className="max-h-[calc(100svh-5rem)] overflow-auto" data-match-scroll>
        <table className="w-full min-w-[72rem] text-sm">
          <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--panel-border)]" data-match-head>
            <tr>
              {COLUMNS.map((c) => {
                const on = sort.key === c.key;
                const Arrow = !on ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th key={c.key} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={cn("h-10 px-4 align-middle text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground", c.text ? "text-left" : "text-right")}>
                    <button type="button" onClick={() => sortBy(c.key)} data-match-sort-by={c.key}
                      className={cn("inline-flex items-center gap-1 uppercase leading-tight transition-colors hover:text-foreground", !c.text && "flex-row-reverse text-right", on && "text-foreground")}>
                      <span>{c.key === "renew" ? `Renew ${renewLabel}` : c.label}</span>
                      <Arrow className={cn("size-3 shrink-0", !on && "opacity-40")} aria-hidden />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-b border-[var(--panel-border)] last:border-0" data-match-row={r.id}>
                <td className="max-w-48 truncate px-4 py-3.5" title={r.client ?? ""}>
                  {r.client ?? "—"}
                  {r.rep ? <span className="block truncate text-[0.7rem] text-muted-foreground">{r.rep}</span> : null}
                </td>
                <td className="max-w-64 truncate px-4 py-3.5 font-medium" title={r.project}><Link href={`/projects/${r.id}`} className="hover:text-primary">{r.project}</Link></td>
                <td className="px-4 py-3.5 text-right tabular-nums">{r.goal?.toLocaleString() ?? "—"}</td>
                <td className="px-4 py-3.5 text-right tabular-nums">{r.leads.toLocaleString()}</td>
                <td className={cn("px-4 py-3.5 text-right tabular-nums", r.owed < 0 && "text-emerald-500")}>{r.owed?.toLocaleString() ?? "—"}</td>
                <td className="px-4 py-3.5 text-right tabular-nums">{r.pct == null ? "—" : `${r.pct}%`}</td>
                <td className="px-4 py-3.5 text-right tabular-nums">
                  {r.matches ? (
                    <Link href={`/reports/matches/${r.id}`} className="rounded px-1.5 py-0.5 font-semibold text-primary transition-colors hover:bg-primary/10" data-match-link>
                      {r.matches.toLocaleString()}
                    </Link>
                  ) : <span className="text-muted-foreground">0</span>}
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums">{r.renew.toLocaleString()}</td>
                <td className="px-4 py-3.5 text-right tabular-nums">{r.developed.toLocaleString()}</td>
                <td className="px-4 py-3.5 text-right tabular-nums">{r.matched.toLocaleString()}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-muted-foreground">{r.startLabel}</td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums text-muted-foreground">{r.dueLabel}</td>
                <td className={cn("px-4 py-3.5 text-right tabular-nums", r.behind > 0 && "font-semibold text-amber-500")}>{r.behind == null ? "—" : r.behind.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No active projects.</p>
          : shown.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No projects match these filters.</p> : null}
      </div>
    </>
  );
}
