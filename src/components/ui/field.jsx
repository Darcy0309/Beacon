"use client";

import { Children, cloneElement, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// A list this long opens with a search box (Oct 2026): type to find, rather than scroll.
const SEARCH_FROM = 13;

/** The <option>s among a select's children, as { value, label, disabled }. */
function optionsOf(children) {
  const out = [];
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    if (c.type === "option") out.push({ value: String(c.props.value ?? ""), label: String(Children.toArray(c.props.children).join("")), disabled: Boolean(c.props.disabled) });
    else if (c.type === "optgroup") out.push(...optionsOf(c.props.children));
  });
  return out;
}

export function Label({ className, ...props }) {
  return (
    <label
      className={cn("text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

/**
 * A native select in the app's style. An uncontrolled one keeps its
 * `defaultValue` in step with the page: React applies a select's default
 * only when it mounts, so after a refused save (React resets the form, and
 * the action sends back what was submitted) it would otherwise snap back to
 * the choice the form opened with, and the next save would quietly send that.
 */
export function Select({ className, ref, searchable, ...props }) {
  const own = useRef(null);
  const setRef = useCallback(
    (node) => {
      own.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );
  const { value, defaultValue } = props;
  useLayoutEffect(() => {
    const el = own.current;
    if (!el || value !== undefined || defaultValue === undefined) return;
    const want = String(defaultValue ?? "");
    if (![...el.options].some((o) => o.value === want)) return;
    for (const o of el.options) o.defaultSelected = o.value === want;
    el.value = want;
  }, [value, defaultValue]);

  // A dialog stops the page behind it scrolling by catching the wheel on the
  // document, and it cannot see that an open list (the browser's own picker)
  // scrolls: so the wheel never reached it. While the list is open, the wheel
  // stays with it.
  const { onWheel } = props;
  const keepWheel = (e) => {
    onWheel?.(e);
    try {
      if (e.currentTarget.matches(":open")) e.stopPropagation();
    } catch {
      /* a browser without :open has no styled picker to scroll */
    }
  };

  const options = useMemo(() => optionsOf(props.children), [props.children]);
  const search = searchable ?? options.length >= SEARCH_FROM;

  if (search) return <SearchSelect selectRef={setRef} own={own} options={options} className={className} {...props} />;
  return (
    <select
      ref={setRef}
      className={cn(
        "h-9 w-full rounded-md border border-input bg-background/60 px-2.5 text-sm outline-none transition-colors focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50",
        "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/30",
        className
      )}
      {...props}
      onWheel={keepWheel}
    />
  );
}

/**
 * A long select you can search (Oct 2026): a button showing the choice opens the list with a
 * search box on top; typing (on the button or in the box) narrows it, the arrows move, Enter
 * picks, Escape closes. The real <select> stays underneath, out of sight, and carries the value:
 * the form sends it, `onChange` and `value` work as on any select, and a value set on it from
 * outside shows on the button.
 */
function SearchSelect({ selectRef, own, options, className, children, disabled, "aria-label": ariaLabel, "aria-invalid": ariaInvalid, "aria-describedby": describedBy, id, ...props }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [current, setCurrent] = useState(null); // the value the select holds
  const listRef = useRef(null);

  // Follow the select: its value as it starts (and after a form resets), and whenever it changes.
  useEffect(() => {
    const el = own.current;
    if (!el) return undefined;
    const read = () => setCurrent(el.value);
    read();
    el.addEventListener("change", read);
    const form = el.form;
    const reset = () => setTimeout(read, 0);
    form?.addEventListener("reset", reset);
    return () => {
      el.removeEventListener("change", read);
      form?.removeEventListener("reset", reset);
    };
  }, [own]);
  useEffect(() => {
    if (props.value !== undefined) setCurrent(String(props.value ?? ""));
  }, [props.value]);

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return words.length ? options.filter((o) => words.every((w) => o.label.toLowerCase().includes(w))) : options;
  }, [options, q]);
  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const label = options.find((o) => o.value === current)?.label ?? options[0]?.label ?? "";
  const choose = (o) => {
    if (!o || o.disabled) return;
    const el = own.current;
    if (el) {
      // Set it as a person would, so React's onChange and any listener hear it.
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, o.value);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setCurrent(o.value);
    setOpen(false);
    setQ("");
  };
  const keys = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(shown.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(shown[active]); }
  };

  return (
    <div className="relative min-w-0" data-search-select>
      {/* The real select: out of sight, still in the form. */}
      <select ref={selectRef} {...props} disabled={disabled} aria-label={ariaLabel} aria-invalid={ariaInvalid} tabIndex={-1} aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0">
        {children}
      </select>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
        <PopoverTrigger asChild>
          <button type="button" id={id} aria-describedby={describedBy} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel ? `${ariaLabel}: ${label}` : undefined}
            aria-invalid={ariaInvalid} data-search-select-button
            onKeyDown={(e) => {
              // Typing on the closed list opens it, searching for what was typed.
              if (!open && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setQ(e.key); setOpen(true); }
              else if (!open && (e.key === "ArrowDown" || e.key === "Enter")) { e.preventDefault(); setOpen(true); }
            }}
            className={cn(
              "flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background/60 px-2.5 text-left text-sm outline-none transition-colors focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50",
              "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/30",
              className
            )}>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-[max(var(--radix-popover-trigger-width),14rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0" data-search-select-list>
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--panel-border)] px-2.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={keys} placeholder="Type to search…"
              aria-label={`Search ${ariaLabel ?? "the list"}`} className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" data-search-select-input />
          </div>
          {/* The wheel stays with the list, also inside a dialog that holds the page still. */}
          <div ref={listRef} role="listbox" aria-label={ariaLabel} className="max-h-64 min-h-0 overflow-y-auto overscroll-contain p-1" onWheel={(e) => e.stopPropagation()}>
            {shown.map((o, i) => {
              const on = o.value === current;
              return (
                <button key={`${o.value}|${i}`} type="button" role="option" aria-selected={on} disabled={o.disabled} data-index={i} data-value={o.value}
                  onClick={() => choose(o)} onMouseMove={() => setActive(i)}
                  className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors disabled:opacity-40",
                    i === active ? "bg-muted" : "", on && "font-semibold text-primary")}>
                  <span className="flex size-4 shrink-0 items-center justify-center">{on ? <Check className="size-3.5" /> : null}</span>
                  <span className="min-w-0 flex-1 break-words">{o.label}</span>
                </button>
              );
            })}
            {shown.length === 0 ? <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matches.</p> : null}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * Label + control stacked, the standard form row used across record forms.
 * Pass `error` to show a validation message beneath the control; pair it with
 * `aria-invalid` on the control itself so the border turns red. A single
 * control is tied to its label (an id and htmlFor) and to the message beneath
 * it (aria-describedby), so a screen reader names it and reads the error.
 */
export function Field({ label, children, className, hint, error, required }) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error || hint;
  const only = Children.count(children) === 1 && isValidElement(children) ? children : null;
  const controlId = only?.props.id ?? id;
  const control = only
    ? cloneElement(only, {
        id: controlId,
        "aria-describedby": [only.props["aria-describedby"], note ? noteId : null].filter(Boolean).join(" ") || undefined,
      })
    : children;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={only ? controlId : undefined}>
        {label}
        {required ? <span className="ml-0.5 text-destructive" aria-hidden>*</span> : null}
      </Label>
      {control}
      {error ? (
        <p id={noteId} role="alert" className="text-[0.7rem] font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p id={noteId} className="text-[0.7rem] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Small helper for forms: given the action state, returns
 *   fe(name)  -> the field's error message or undefined
 *   dv(name, fallback) -> the value to use as defaultValue, preferring what the
 *                         user just submitted so a failed submit keeps their input
 */
export function formHelpers(state, record) {
  const errors = state?.fieldErrors ?? {};
  const submitted = state?.values ?? null;
  return {
    fe: (name) => errors[name],
    invalid: (name) => (errors[name] ? true : undefined),
    dv: (name, fallback = "") =>
      submitted && name in submitted ? submitted[name] : record?.[name] ?? fallback,
  };
}
