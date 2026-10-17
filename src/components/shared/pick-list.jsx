"use client";

import { useId, useState } from "react";
import { ChevronDown, ListChecks, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/**
 * Several choices from a list (Sean, Oct 2026: the states an agent is
 * licensed in, the carriers they write with): a box of what is chosen, each
 * with an × to take it off, and a drop-down under it that adds another and
 * fills the box. Submits each choice as a hidden input called `name`.
 * Controlled: `value` (the chosen) and `onChange(next)`. `sorted`: kept in
 * the list's order (the states), else in the order picked. `id` goes to the
 * drop-down, so a Field's label names it.
 *
 * Check list (Sean, Oct 2026: clients licensed in 20+ states, or all): the
 * whole list opens to tick and untick, with Select all and Clear (for what
 * is shown: find first to pick only those), and a box to find one in a long
 * list. `columns`: several across, for short choices like the states.
 */
export default function PickList({ name, options, value, onChange, placeholder = "Add…", empty = "None chosen yet", sorted = false, invalid, id, label, columns = false, "aria-describedby": describedBy }) {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState("");
  const panelId = useId();
  const order = (list) => (sorted ? options.filter((o) => list.includes(o)).concat(list.filter((v) => !options.includes(v))) : list);
  const add = (v) => v && !value.includes(v) && onChange(order([...value, v]));
  const remove = (v) => onChange(value.filter((x) => x !== v));
  const left = options.filter((o) => !value.includes(o));
  const needle = find.trim().toLowerCase();
  const shown = needle ? options.filter((o) => o.toLowerCase().includes(needle)) : options;
  const toggle = (v, on) => (on ? add(v) : remove(v));
  const selectAll = () => onChange(order([...value, ...shown.filter((o) => !value.includes(o))]));
  const clear = () => onChange(value.filter((v) => !shown.includes(v)));

  return (
    <div data-pick-list={name} className={cn("rounded-md border bg-background/60 p-1.5", invalid ? "border-destructive" : "border-input")}>
      {value.length ? (
        <ul className="flex flex-wrap gap-1.5 p-0.5" aria-label={label ? `${label}: chosen` : undefined}>
          {value.map((v) => (
            <li key={v} data-picked={v} className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/40 bg-primary/10 py-0.5 pl-2.5 pr-0.5 text-xs text-primary">
              <span className="truncate">{v}</span>
              <button type="button" onClick={() => remove(v)} aria-label={`Take ${v} off`}
                className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-primary/20">
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-1 py-0.5 text-xs text-muted-foreground">{empty}</p>
      )}
      <div className="mt-1.5 flex gap-1.5">
        <Select id={id} aria-label={label} aria-describedby={describedBy} aria-invalid={invalid || undefined} value="" onChange={(e) => add(e.target.value)}
          disabled={!left.length} className="h-8 min-w-0 flex-1 text-xs">
          <option value="">{left.length ? placeholder : "All chosen"}</option>
          {left.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen((o) => !o)} disabled={!options.length}
          aria-expanded={open} aria-controls={panelId} data-pick-open className="h-8 shrink-0 text-xs">
          <ListChecks /> Check list <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      </div>
      {open ? (
        <div id={panelId} data-pick-panel className="mt-1.5 rounded-md border border-[var(--panel-border)] bg-muted/20">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--panel-border)] p-1.5">
            {options.length > 12 ? (
              <div className="relative min-w-0 flex-1 basis-40">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find…"
                  onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} aria-label={label ? `${label}: find` : "Find"}
                  className="h-8 pl-7 text-xs" data-pick-find />
              </div>
            ) : null}
            <div className="ml-auto flex items-center gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={selectAll} disabled={shown.every((o) => value.includes(o))} data-pick-all className="h-8 text-xs">
                Select all{needle ? " shown" : ""}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!shown.some((o) => value.includes(o))} data-pick-clear className="h-8 text-xs">
                Clear{needle ? " shown" : ""}
              </Button>
            </div>
          </div>
          {shown.length ? (
            <ul role="group" aria-label={label ? `${label}: check list` : "Check list"}
              className={cn("grid max-h-60 gap-x-2 overflow-y-auto p-1.5", columns ? "grid-cols-4 sm:grid-cols-7" : "grid-cols-1 sm:grid-cols-2")}>
              {shown.map((o) => {
                const on = value.includes(o);
                return (
                  <li key={o}>
                    <label data-pick-option={o} className={cn("relative flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs transition-colors hover:bg-primary/10", on && "text-primary")}>
                      <input type="checkbox" checked={on} onChange={(e) => toggle(o, e.target.checked)} className="size-3.5 shrink-0 accent-[var(--primary)]" />
                      <span className="truncate" title={o}>{o}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="p-2 text-xs text-muted-foreground">Nothing matches.</p>
          )}
          <div className="flex items-center justify-between border-t border-[var(--panel-border)] px-2 py-1">
            <span className="text-[0.7rem] text-muted-foreground" data-pick-count>{value.length} of {options.length} chosen</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setOpen(false); setFind(""); }} className="h-7 text-xs">Done</Button>
          </div>
        </div>
      ) : null}
      {value.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
    </div>
  );
}
