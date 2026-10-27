"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { territoryList } from "@/features/list-builder/actions";
import { cn } from "@/lib/utils";

/**
 * Counties or cities to tick from a list (Sean, Oct 2026: "in case the user
 * doesn't want to type out the names", and to see ones they might not think
 * of): every one in the states picked, from the Census's names, under each
 * state's heading, with a box to find one. A tick adds the tag typing would
 * ("Maricopa County, AZ"); taking the tick off takes it away.
 *
 *   kind    "counties" or "cities"
 *   states  the states picked
 *   value   the tags; onChange(tags)
 */
export default function PlaceBrowser({ kind, label, states, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState("");
  const [lists, setLists] = useState(null);
  const key = states.join();

  useEffect(() => {
    if (!open || !states.length) return undefined;
    let live = true;
    setLists(null);
    territoryList(kind, states).then((l) => { if (live) setLists(l); }).catch(() => { if (live) setLists([]); });
    return () => { live = false; };
  }, [open, kind, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const picked = useMemo(() => new Set(value.map((v) => v.toLowerCase())), [value]);
  const toggle = (name) => {
    if (picked.has(name.toLowerCase())) onChange(value.filter((v) => v.toLowerCase() !== name.toLowerCase()));
    else onChange([...value, name]);
  };
  const words = find.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (lists ?? []).map((l) => ({ ...l, names: words.length ? l.names.filter((n) => words.every((w) => n.toLowerCase().includes(w))) : l.names }))
    .filter((l) => l.names.length);
  const many = states.length > 1;
  const noun = kind === "counties" ? "county" : "city";

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setFind(""); }}>
      <PopoverTrigger asChild>
        <button type="button" disabled={!states.length} aria-label={`${label}: choose from a list`} data-place-browse={kind}
          title={states.length ? undefined : "Pick a state first"}
          className="ml-auto flex h-7 shrink-0 items-center gap-1 rounded-md border border-input bg-background/60 px-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">
          Browse <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden bg-card p-0" data-place-list={kind}>
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--panel-border)] px-2.5">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder={`Find a ${noun}…`}
            aria-label={`Find a ${noun}`} className="h-9 min-w-0 flex-1 bg-transparent text-xs outline-none" data-place-find />
        </div>
        <div role="listbox" aria-multiselectable aria-label={label} className="max-h-80 min-h-0 overflow-y-auto overscroll-contain p-1" onWheel={(e) => e.stopPropagation()}>
          {lists === null ? <p className="px-2 py-3 text-center text-xs text-muted-foreground">Loading…</p> : null}
          {shown.map((l) => (
            <Fragment key={l.state}>
              {many ? <div className="eyebrow px-2 pb-1 pt-2">{l.state}</div> : null}
              {l.names.map((n) => {
                const on = picked.has(n.toLowerCase());
                return (
                  <button key={n} type="button" role="option" aria-selected={on} onClick={() => toggle(n)} data-place={n}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/60">
                    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                      {on ? <Check className="size-3" /> : null}
                    </span>
                    <span className="flex-1">{many ? n : n.replace(/, [A-Z]{2}$/, "")}</span>
                  </button>
                );
              })}
            </Fragment>
          ))}
          {lists !== null && !shown.length ? <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matches.</p> : null}
        </div>
        {value.length ? (
          <div className="shrink-0 border-t border-[var(--panel-border)] px-3 py-2 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {value.length} chosen
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
