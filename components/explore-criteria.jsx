"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, X, Loader2, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FIELDS, MONTHS } from "@/lib/explore";
import { cn } from "@/lib/utils";

/**
 * The explorer's criteria panel. Every choice is written to the URL, so the
 * page re-runs the query on the server and the question stays shareable.
 */
export default function ExploreCriteria({ options, criteria }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const apply = (mutate) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    params.delete("page"); // a new question starts at the first page
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const setList = (key, values) =>
    apply((p) => (values.length ? p.set(key, values.join(",")) : p.delete(key)));

  const toggle = (key, value) => {
    const current = criteria[key] ?? [];
    const next = current.includes(String(value))
      ? current.filter((v) => v !== String(value))
      : [...current, String(value)];
    setList(key, next);
  };

  const clearAll = () =>
    apply((p) => {
      for (const f of FIELDS) p.delete(f.key);
      p.delete("zips");
      p.delete("q");
    });

  const active = FIELDS.reduce((n, f) => n + (criteria[f.key]?.length ?? 0), 0) + (criteria.zips?.length ?? 0);

  const sourceFor = (field) => (field.options === "months" ? MONTHS : options[field.options] ?? []);

  return (
    <div className="space-y-3 p-5">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
        {FIELDS.map((field) => (
          <MultiSelect
            key={field.key}
            label={field.label}
            hint={field.hint}
            options={sourceFor(field)}
            selected={criteria[field.key] ?? []}
            onToggle={(v) => toggle(field.key, v)}
            onClear={() => setList(field.key, [])}
          />
        ))}
        <ZipInput value={(criteria.zips ?? []).join(", ")} onCommit={(v) => apply((p) => (v ? p.set("zips", v) : p.delete("zips")))} />

        <div className="ml-auto flex items-center gap-3">
          {isPending ? <Loader2 className="size-4 animate-spin text-primary" aria-label="Running" /> : null}
          {active > 0 ? (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              <X /> Clear {active} filter{active === 1 ? "" : "s"}
            </Button>
          ) : null}
        </div>
      </div>

      {active > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--panel-border)] pt-3">
          <SlidersHorizontal className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          {FIELDS.flatMap((field) =>
            (criteria[field.key] ?? []).map((value) => {
              const label = sourceFor(field).find((o) => String(o.value) === value)?.label ?? value;
              return (
                <Chip key={`${field.key}:${value}`} onRemove={() => toggle(field.key, value)}>
                  <span className="text-muted-foreground">{field.label}:</span> {label}
                </Chip>
              );
            })
          )}
          {(criteria.zips ?? []).map((zip) => (
            <Chip
              key={`zip:${zip}`}
              onRemove={() => setList("zips", (criteria.zips ?? []).filter((z) => z !== zip))}
            >
              <span className="text-muted-foreground">ZIP:</span> {zip}
            </Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Chip({ children, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 py-1 pl-2.5 pr-1 text-xs text-primary">
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove filter"
        className="flex size-4 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-primary/20"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

/** A labelled dropdown of checkboxes. Closes on outside click or Escape. */
function MultiSelect({ label, hint, options, selected, onToggle, onClear }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (options.length === 0) return null;

  const shown = filter
    ? options.filter((o) => String(o.label).toLowerCase().includes(filter.toLowerCase()))
    : options;
  const summary = selected.length === 0 ? "All" : selected.length === 1
    ? options.find((o) => String(o.value) === selected[0])?.label ?? selected[0]
    : `${selected.length} selected`;

  return (
    <div className="relative" ref={ref}>
      <span className="eyebrow mb-1 block">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex h-8 min-w-36 max-w-56 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-xs transition-colors",
          selected.length
            ? "border-primary/50 bg-primary/10 text-primary"
            : "border-input bg-background/60 text-muted-foreground hover:border-primary/40"
        )}
      >
        <span className="flex-1 truncate text-left">{summary}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-multiselectable
          className="absolute left-0 z-30 mt-1 w-64 overflow-hidden rounded-lg border bg-card shadow-xl"
        >
          {hint ? <div className="border-b border-[var(--panel-border)] px-3 py-1.5 text-[0.62rem] text-muted-foreground">{hint}</div> : null}
          {options.length > 8 ? (
            <div className="border-b border-[var(--panel-border)] p-2">
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={`Filter ${label.toLowerCase()}…`}
                aria-label={`Filter ${label}`}
                className="h-7 text-xs"
                autoFocus
              />
            </div>
          ) : null}
          <div className="max-h-64 overflow-y-auto p-1">
            {shown.map((o) => {
              const on = selected.includes(String(o.value));
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => onToggle(o.value)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/60"
                >
                  <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                    {on ? <Check className="size-3" /> : null}
                  </span>
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.count != null ? <span className="tabular-nums text-muted-foreground">{o.count}</span> : null}
                </button>
              );
            })}
            {shown.length === 0 ? <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matches.</p> : null}
          </div>
          {selected.length > 0 ? (
            <button
              type="button"
              onClick={onClear}
              className="w-full cursor-pointer border-t border-[var(--panel-border)] px-3 py-2 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-primary"
            >
              Clear {label.toLowerCase()}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** ZIPs are typed rather than picked — there are too many to list. */
function ZipInput({ value, onCommit }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div>
      <span className="eyebrow mb-1 block">ZIP codes</span>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && onCommit(text)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit(text);
          }
        }}
        placeholder="85018, 85016…"
        aria-label="ZIP codes"
        inputMode="numeric"
        className="h-8 w-44 text-xs"
      />
    </div>
  );
}
