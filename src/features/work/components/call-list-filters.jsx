"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, Filter, Search, SlidersHorizontal, X } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  FILTER_FIELDS, MONTH_DAYS, MONTH_NAMES, RENEWAL_LINES, cleanCriteria, describeCriteria, monthDay, monthWindow,
} from "@/lib/call-list-filter";
import { cn } from "@/lib/utils";
import { saveCallListFilter } from "@/features/work/actions";

/** Include · Exclude, for one criterion. */
function Mode({ exclude, onChange, label }) {
  return (
    <span className="inline-flex rounded-md border border-[var(--panel-border)] p-px text-[0.6rem] font-semibold uppercase tracking-[0.08em]" role="group" aria-label={`${label}: include or exclude`}>
      {[[false, "Include"], [true, "Exclude"]].map(([value, text]) => (
        <button key={text} type="button" aria-pressed={exclude === value} onClick={() => onChange(value)}
          className={cn("rounded px-1.5 leading-5 transition-colors",
            exclude === value ? (value ? "bg-rose-500/15 text-rose-500" : "bg-primary/15 text-primary") : "text-muted-foreground hover:text-foreground")}>
          {text}
        </button>
      ))}
    </span>
  );
}

/** A month and a day of it, as "MM-DD". */
function MonthDayPick({ value, onChange, label }) {
  const month = value ? Number(value.slice(0, 2)) : "";
  const day = value ? Number(value.slice(3)) : "";
  return (
    <span className="inline-flex items-center gap-1" role="group" aria-label={label}>
      <Select aria-label={`${label}: month`} value={month} className="h-8 w-[5.5rem]"
        onChange={(e) => onChange(e.target.value ? monthDay(e.target.value, Math.min(day || 1, MONTH_DAYS[e.target.value - 1])) : null)}>
        <option value="">Month</option>
        {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </Select>
      <Select aria-label={`${label}: day`} value={day} className="h-8 w-[4.5rem]" disabled={!month}
        onChange={(e) => onChange(monthDay(month, e.target.value))}>
        {Array.from({ length: month ? MONTH_DAYS[month - 1] : 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
      </Select>
    </span>
  );
}

/** Choose any of a criterion's values (searchable), each with how many names have it. */
function Values({ field, options, chosen, onChange }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return options.filter((o) => words.every((w) => String(o.label).toLowerCase().includes(w)));
  }, [options, q]);
  const set = new Set(chosen);
  const toggle = (v) => onChange(set.has(v) ? chosen.filter((x) => x !== v) : [...chosen, v]);
  const first = options.find((o) => String(o.value) === chosen[0])?.label ?? chosen[0];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" disabled={!options.length} data-values={field.key}
          className="flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background/60 px-2.5 text-left text-sm transition-colors hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50">
          <span className={cn("truncate", !chosen.length && "text-muted-foreground")}>
            {chosen.length ? (chosen.length === 1 ? first : `${first} +${chosen.length - 1}`) : options.length ? "Any" : "None on this list"}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" data-values-menu={field.key}>
        <div className="relative mb-1.5">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Find a ${field.label.toLowerCase()}…`} className="h-8 pl-7" aria-label={`Find a ${field.label.toLowerCase()}`} />
        </div>
        <ul className="max-h-64 overflow-y-auto" role="listbox" aria-multiselectable="true" aria-label={field.label}>
          {shown.map((o) => {
            const v = String(o.value);
            const on = set.has(v);
            return (
              <li key={v}>
                <button type="button" role="option" aria-selected={on} onClick={() => toggle(v)} data-value={v}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted">
                  <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                    {on ? <Check className="size-3" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{o.count}</span>
                </button>
              </li>
            );
          })}
          {!shown.length ? <li className="px-2 py-3 text-center text-xs text-muted-foreground">Nothing matches.</li> : null}
        </ul>
        {chosen.length ? (
          <button type="button" onClick={() => onChange([])} className="mt-1.5 w-full rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            Clear {field.label.toLowerCase()}
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Narrow a call list to the names most worth calling now: those renewing in
 * a window of the year (any year; Nov 1 – Jan 31 runs over the new year), in
 * given cities, ZIP codes or counties, industries, with given carriers,
 * developed in a given year or by given managers, or with given results —
 * each included or excluded. Applied, it is kept for this project, and
 * Start calling, Skip and the next name after a result all follow it.
 *
 *   criteria   what is kept (cleanCriteria())
 *   options    getCallListOptions(): { city: [{ value, label, count }], … }
 *   matching   names that pass it; all  names left without it
 */
export default function CallListFilters({ projectId, criteria, options, matching, all }) {
  const router = useRouter();
  const [draft, setDraft] = useState(criteria);
  const [saving, startSaving] = useTransition();
  useEffect(() => setDraft(criteria), [criteria]);

  const clean = cleanCriteria(draft);
  const dirty = JSON.stringify(clean) !== JSON.stringify(cleanCriteria(criteria));
  const applied = describeCriteria(criteria, options);

  const save = (next) =>
    startSaving(async () => {
      const f = new FormData();
      f.set("project_id", String(projectId));
      f.set("criteria", JSON.stringify(cleanCriteria(next)));
      const result = await saveCallListFilter(f);
      if (result.ok) {
        toast.success(Object.keys(result.data.criteria).length ? "Filter applied to your list" : "Filter cleared");
        router.refresh();
      } else toast.error(result.error);
    });

  const setRenewal = (patch) => {
    const r = { ...(draft.renewal ?? {}), ...patch };
    setDraft({ ...draft, renewal: r });
  };
  const renewal = draft.renewal ?? {};
  const pickedMonth = (m) => {
    const w = monthWindow(m);
    return renewal.from === w.from && renewal.to === w.to;
  };

  return (
    <Card data-call-list-filters>
      <SectionHeader wrap label="Filter this list" icon={SlidersHorizontal}
        action={
          <span className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground" data-filter-count>
            {applied.length ? `${matching.toLocaleString()} of ${all.toLocaleString()} names match` : `${all.toLocaleString()} names, no filter`}
          </span>
        } />
      <div className="space-y-4 p-5">
        {/* When it renews: a window of the year, or one month with a click. */}
        <div className="space-y-2" data-renewal-filter>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="eyebrow">Renewal</span>
            <Mode label="Renewal" exclude={renewal.exclude === true} onChange={(exclude) => setRenewal({ exclude })} />
            <span className="text-muted-foreground">{renewal.exclude ? "not between" : "between"}</span>
            <MonthDayPick label="From" value={renewal.from ?? null} onChange={(from) => setRenewal({ from })} />
            <span className="text-muted-foreground">and</span>
            <MonthDayPick label="To" value={renewal.to ?? null} onChange={(to) => setRenewal({ to })} />
            <span className="text-xs text-muted-foreground">
              {(renewal.from ? 1 : 0) + (renewal.to ? 1 : 0) === 1 ? "choose both days" : "any year, on"}
            </span>
            {/* Any of the name's X-dates, or one policy line's. */}
            <Select aria-label="Which renewal date" value={renewal.line ?? ""} className="h-8 w-auto" data-renewal-line
              onChange={(e) => setRenewal({ line: e.target.value || undefined })}>
              <option value="">any policy line</option>
              {RENEWAL_LINES.map((l) => <option key={l.key} value={l.key}>{l.key === "ultimate" ? "the Ultimate X-Date" : `${l.label} only`}</option>)}
            </Select>
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Renews in the month of">
            {MONTH_NAMES.map((m, i) => (
              <button key={m} type="button" data-month={i + 1} aria-pressed={pickedMonth(i + 1)}
                onClick={() => setDraft({ ...draft, renewal: { ...monthWindow(i + 1), line: renewal.line, exclude: renewal.exclude === true } })}
                className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                  pickedMonth(i + 1) ? "border-primary bg-primary/15 text-primary" : "border-[var(--panel-border)] text-muted-foreground hover:border-primary/40 hover:text-foreground")}>
                {m}
              </button>
            ))}
            {draft.renewal ? (
              <button type="button" onClick={() => { const { renewal: _r, ...rest } = draft; setDraft(rest); }}
                className="rounded-full px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
                Any time
              </button>
            ) : null}
          </div>
        </div>

        {/* Everything else: values to include or exclude. */}
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
          {FILTER_FIELDS.map((field) => {
            const c = draft[field.key] ?? { values: [], exclude: false };
            return (
              <div key={field.key} className="min-w-0 space-y-1" data-criterion={field.key}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{field.label}</span>
                  <Mode label={field.label} exclude={c.exclude === true} onChange={(exclude) => setDraft({ ...draft, [field.key]: { ...c, exclude } })} />
                </div>
                <Values field={field} options={options[field.key] ?? []} chosen={c.values ?? []}
                  onChange={(values) => setDraft({ ...draft, [field.key]: { ...c, values } })} />
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--panel-border)] pt-4">
          <div className="flex min-w-0 flex-wrap gap-1.5" data-applied-filters>
            {applied.length ? applied.map((a) => (
              <span key={a.key} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                a.exclude ? "border-rose-400/40 text-rose-500" : "border-primary/40 text-primary")}>
                <Filter className="size-3" /> {a.text}
              </span>
            )) : <span className="text-xs text-muted-foreground">No filter: every name left to call.</span>}
            {/* Kept through the day (a lunch break, a restart); the list starts in full each morning. */}
            <span className="w-full text-[0.66rem] text-muted-foreground" data-filter-lasts>
              {applied.length ? "Kept for today; your list starts in full again tomorrow morning." : "A filter you apply is kept for the rest of today."}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {applied.length || Object.keys(clean).length ? (
              <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => { setDraft({}); save({}); }} data-clear-filters>
                <X /> Clear all
              </Button>
            ) : null}
            <Button type="button" size="sm" disabled={saving || !dirty} onClick={() => save(draft)} data-apply-filters>
              <Filter /> {saving ? "Applying…" : "Apply filters"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
