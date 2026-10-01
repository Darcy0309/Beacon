"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 250;

/**
 * Choose a lead by typing part of its company, contact, phone or city. It
 * searches the database as you type (/api/lead-options), so every lead can
 * be found, however many there are. The chosen lead's id is submitted in a
 * hidden input called `name`.
 *
 * Keyboard: arrows move through the matches, Enter picks one, Escape closes
 * the list.
 */
export default function LeadPicker({ name = "lead_id", invalid, placeholder = "Type a company, contact, phone or city…" }) {
  const [chosen, setChosen] = useState(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef(null);
  const listId = useId();

  // Search while the list is open, a moment after the typing stops.
  useEffect(() => {
    if (!open || chosen) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/lead-options?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        const body = await res.json();
        setResults(body.leads ?? []);
        setFailed(!res.ok);
        setActive(0);
      } catch (err) {
        if (err.name !== "AbortError") setFailed(true);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, open, chosen]);

  const pick = (lead) => {
    setChosen(lead);
    setOpen(false);
  };

  const clear = () => {
    setChosen(null);
    setQ("");
    setOpen(true);
    // The input comes back on the next render.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (results.length) setActive((i) => (i + (e.key === "ArrowDown" ? 1 : results.length - 1)) % results.length);
    } else if (e.key === "Enter") {
      // Never submit the form from the search box.
      e.preventDefault();
      if (open && results[active]) pick(results[active]);
    } else if (e.key === "Escape" && open) {
      // Close the list, not the dialog around it.
      e.stopPropagation();
      setOpen(false);
    }
  };

  const optionId = (lead) => `${listId}-${lead.id}`;

  return (
    <div className="relative">
      <input type="hidden" name={name} value={chosen?.id ?? ""} />
      {chosen ? (
        <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-background/60 px-3 text-sm">
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">{chosen.co}</span>
            {chosen.city && chosen.city !== "—" ? <span className="text-muted-foreground"> — {chosen.city}</span> : null}
          </span>
          <button type="button" onClick={clear} aria-label="Choose a different lead" className="cursor-pointer rounded text-muted-foreground transition-colors hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && results[active] ? optionId(results[active]) : undefined}
            aria-invalid={invalid}
            autoComplete="off"
            value={q}
            placeholder={placeholder}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            // Let a click on a match land before the list closes.
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={onKeyDown}
            className="pl-9"
          />
          {loading ? <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
        </div>
      )}

      {open && !chosen ? (
        <ul id={listId} role="listbox" aria-label="Matching leads" className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
          {results.map((lead, i) => (
            <li
              key={lead.id}
              id={optionId(lead)}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(lead);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("cursor-pointer rounded px-3 py-1.5 text-sm", i === active && "bg-primary/10 text-primary")}
            >
              <div className="truncate font-medium">{lead.co}</div>
              <div className="truncate text-xs text-muted-foreground">{[lead.contact, lead.city !== "—" ? lead.city : null].filter(Boolean).join(" · ")}</div>
            </li>
          ))}
          {!results.length ? (
            <li className="px-3 py-2 text-sm text-muted-foreground" aria-live="polite">
              {loading ? "Searching…" : failed ? "Lead search is unavailable right now." : q.trim() ? `No leads match “${q.trim()}”.` : "Type to search every lead."}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
