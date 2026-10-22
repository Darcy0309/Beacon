"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useReportPending } from "@/components/layout/navigation-progress";
import { cn } from "@/lib/utils";

/**
 * A filter of several choices at once, kept in the URL (?name=a,b,c) as a
 * report's filters are (Sean, Oct 2026: like Lead Explorer's): a button
 * saying what is picked, opening a list of check boxes with "All" at the
 * top (which clears the rest). Changing it also drops the params in
 * `clears`. Closes on a click outside or Escape.
 *
 *   values   the values picked now (strings); none: all
 */
export default function ParamMulti({ name, label, values = [], options, clears = ["page"], className }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  useReportPending(pending);
  const [open, setOpen] = useState(false);
  // Opening leftwards when the list would run past the window's right edge.
  const [right, setRight] = useState(false);
  const [find, setFind] = useState("");
  const box = useRef(null);
  const picked = new Set(values.map(String));

  useEffect(() => {
    if (!open) return;
    const away = (e) => !box.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const go = (next) => {
    const params = new URLSearchParams(searchParams.toString());
    // In the list's own order, so the address reads the same however they were ticked.
    const list = options.map((o) => String(o.value)).filter((v) => next.has(v));
    if (list.length) params.set(name, list.join(","));
    else params.delete(name);
    for (const c of clears) params.delete(c);
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  const toggle = (v) => {
    const next = new Set(picked);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    go(next);
  };

  const shown = find ? options.filter((o) => String(o.label).toLowerCase().includes(find.toLowerCase())) : options;
  const summary = picked.size === 0 ? "All"
    : picked.size === 1 ? options.find((o) => picked.has(String(o.value)))?.label ?? "1 selected"
    : `${picked.size} selected`;
  const row = "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/60";
  const tick = (on) => (
    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
      {on ? <Check className="size-3" /> : null}
    </span>
  );

  return (
    <div className={cn("relative flex items-center gap-2", className)} ref={box} data-param-multi={name}>
      <span className="eyebrow">{label}</span>
      <button type="button" onClick={() => {
        if (!open) setRight((box.current?.getBoundingClientRect().left ?? 0) + 336 > window.innerWidth);
        setOpen((o) => !o);
      }} aria-expanded={open} aria-haspopup="listbox" aria-label={`${label}: ${summary}`}
        className={cn("flex h-8 min-w-32 max-w-60 items-center gap-2 rounded-md border px-2.5 text-xs transition-colors",
          picked.size ? "border-primary/50 bg-primary/10 text-primary" : "border-input bg-background/60 hover:border-primary/40")}>
        <span className="flex-1 truncate text-left">{summary}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div role="listbox" aria-multiselectable aria-label={label}
          className={cn("absolute top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-card shadow-xl", right ? "right-0" : "left-0")}>
          {options.length > 8 ? (
            <div className="border-b border-[var(--panel-border)] p-2">
              <Input value={find} onChange={(e) => setFind(e.target.value)} placeholder={`Find ${label.toLowerCase()}…`} aria-label={`Find ${label}`} className="h-7 text-xs" autoFocus />
            </div>
          ) : null}
          <div className="max-h-72 overflow-y-auto p-1">
            {/* All: every one (none picked). */}
            <button type="button" role="option" aria-selected={picked.size === 0} onClick={() => go(new Set())} className={cn(row, "font-semibold")} data-option="">
              {tick(picked.size === 0)} All
            </button>
            {shown.map((o) => {
              const on = picked.has(String(o.value));
              return (
                <button key={o.value} type="button" role="option" aria-selected={on} onClick={() => toggle(String(o.value))} className={row} data-option={o.value}>
                  {tick(on)}
                  <span className="min-w-0 flex-1 break-words">{o.label}</span>
                </button>
              );
            })}
            {shown.length === 0 ? <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matches.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
