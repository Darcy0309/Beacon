"use client";

import { X } from "lucide-react";
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
 */
export default function PickList({ name, options, value, onChange, placeholder = "Add…", empty = "None chosen yet", sorted = false, invalid, id, label, "aria-describedby": describedBy }) {
  const order = (list) => (sorted ? options.filter((o) => list.includes(o)).concat(list.filter((v) => !options.includes(v))) : list);
  const add = (v) => v && !value.includes(v) && onChange(order([...value, v]));
  const remove = (v) => onChange(value.filter((x) => x !== v));
  const left = options.filter((o) => !value.includes(o));

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
      <Select id={id} aria-label={label} aria-describedby={describedBy} aria-invalid={invalid || undefined} value="" onChange={(e) => add(e.target.value)}
        disabled={!left.length} className="mt-1.5 h-8 text-xs">
        <option value="">{left.length ? placeholder : "All chosen"}</option>
        {left.map((o) => <option key={o} value={o}>{o}</option>)}
      </Select>
      {value.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
    </div>
  );
}
