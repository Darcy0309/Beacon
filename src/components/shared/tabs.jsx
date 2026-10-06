"use client";

import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Tabs along the top of a panel, as the lead sheet's middle panel and
 * history use them. `tabs`: [{ id, label, count?, content }]. Every panel
 * stays in the page (hidden when not chosen), so what is in it is there at
 * once on switching. Arrow keys move between tabs.
 */
export default function Tabs({ tabs, initial, className, listClassName, panelClassName, label }) {
  const [current, setCurrent] = useState(initial ?? tabs[0]?.id);
  const base = useId();
  const refs = useRef({});

  const onKey = (e) => {
    const i = tabs.findIndex((t) => t.id === current);
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = tabs[(i + step + tabs.length) % tabs.length];
    setCurrent(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} onKeyDown={onKey} className={cn("flex gap-1 overflow-x-auto border-b border-[var(--panel-border)] px-3", listClassName)}>
        {tabs.map((t) => {
          const on = t.id === current;
          return (
            <button
              key={t.id}
              ref={(el) => (refs.current[t.id] = el)}
              type="button"
              role="tab"
              id={`${base}-${t.id}-tab`}
              aria-selected={on}
              aria-controls={`${base}-${t.id}`}
              tabIndex={on ? 0 : -1}
              data-tab={t.id}
              onClick={() => setCurrent(t.id)}
              className={cn(
                "-mb-px flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-[0.68rem] font-bold uppercase tracking-[0.12em] transition-colors",
                on ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
              {t.count != null ? (
                <span className={cn("rounded px-1 text-[0.6rem] tabular-nums", on ? "bg-primary/15" : "bg-muted")}>{t.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-${t.id}`}
          aria-labelledby={`${base}-${t.id}-tab`}
          data-tab-panel={t.id}
          hidden={t.id !== current}
          className={panelClassName}
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
