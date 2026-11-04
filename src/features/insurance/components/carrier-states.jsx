"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FIGURE_CELL } from "@/features/insurance/figure-cell";

/**
 * A carrier's states (Sean, Nov 2026): the number alone in its row, so ten or more of them don't
 * stretch the list; clicked, the states themselves, each with its leads there.
 */
export default function CarrierStates({ name, byState }) {
  const states = Object.entries(byState ?? {}).sort(([a], [b]) => a.localeCompare(b));
  if (!states.length) return <span className="block px-4 py-3.5 text-center tabular-nums text-muted-foreground">0</span>;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`${name}: ${states.length} state${states.length === 1 ? "" : "s"}, show them`} data-carrier-states-open
          className={`${FIGURE_CELL} cursor-pointer`}>
          {states.length}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" data-carrier-states-list>
        <div className="eyebrow border-b border-[var(--panel-border)] px-3 py-2">{states.length} state{states.length === 1 ? "" : "s"} · leads</div>
        <ul className="max-h-72 overflow-y-auto p-1 text-xs">
          {states.map(([st, n]) => (
            <li key={st} data-state={st} className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-muted/60">
              <span className="font-medium">{st}</span>
              <span className="tabular-nums text-muted-foreground">{n.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
