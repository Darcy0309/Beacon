"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useReportPending } from "@/components/layout/navigation-progress";

const KEYS = ["emp_min", "emp_max", "sic", "state", "sort"];
const box = "h-8 rounded-md border border-input bg-background/60 px-2";

/**
 * A project's list narrowed by its names' data and sorted (Sean, Oct 2026):
 * employees from and to, an SIC code or its start, a state, the order. In
 * the address, as the list's other filters are, and applied in place: the
 * list comes again, not the whole page (Darcy, Oct 2026).
 */
export default function NameFilters({ names, sort, sorts }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  useReportPending(pending); // the bar along the top runs while the list is on its way
  const [v, setV] = useState({ emp_min: names.empMin, emp_max: names.empMax, sic: names.sic, state: names.state, sort });
  const digits = (s) => s.replace(/\D/g, "");

  const go = (next) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    for (const k of KEYS) {
      if (next[k]) params.set(k, next[k]);
      else params.delete(k);
    }
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  const any = KEYS.some((k) => searchParams.get(k));

  return (
    <form onSubmit={(e) => { e.preventDefault(); go(v); }} aria-busy={pending}
      className="flex flex-wrap items-end gap-x-3 gap-y-2 border-b border-[var(--panel-border)] px-5 py-3 text-xs" data-name-filters>
      <label className="flex flex-col gap-1"><span className="eyebrow">Employees from</span>
        <input name="emp_min" inputMode="numeric" value={v.emp_min} onChange={(e) => setV({ ...v, emp_min: digits(e.target.value) })} placeholder="Any" className={`${box} w-20`} data-filter-emp-min /></label>
      <label className="flex flex-col gap-1"><span className="eyebrow">to</span>
        <input name="emp_max" inputMode="numeric" value={v.emp_max} onChange={(e) => setV({ ...v, emp_max: digits(e.target.value) })} placeholder="Any" className={`${box} w-20`} data-filter-emp-max /></label>
      <label className="flex flex-col gap-1"><span className="eyebrow">SIC code</span>
        <input name="sic" inputMode="numeric" value={v.sic} onChange={(e) => setV({ ...v, sic: e.target.value.replace(/[^\d-]/g, "") })} placeholder="e.g. 1521 or 15" className={`${box} w-32`} data-filter-sic /></label>
      <label className="flex flex-col gap-1"><span className="eyebrow">State</span>
        <input name="state" maxLength={2} value={v.state} onChange={(e) => setV({ ...v, state: e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase() })} placeholder="AZ" className={`${box} w-14 uppercase`} data-filter-state /></label>
      <label className="flex flex-col gap-1"><span className="eyebrow">Sort</span>
        {/* Choosing an order sorts at once; the other boxes wait for Apply. */}
        <select name="sort" value={v.sort} onChange={(e) => { const next = { ...v, sort: e.target.value }; setV(next); go(next); }} className={box} data-filter-sort>
          {sorts.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select></label>
      <Button type="submit" size="sm" variant="outline" disabled={pending} data-filter-apply>{pending ? "Applying…" : "Apply"}</Button>
      {any ? (
        <button type="button" onClick={() => { const empty = { emp_min: "", emp_max: "", sic: "", state: "", sort: "" }; setV(empty); go(empty); }}
          className="pb-2 font-semibold uppercase tracking-[0.1em] text-primary hover:underline" data-filter-clear>Clear</button>
      ) : null}
    </form>
  );
}
