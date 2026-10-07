"use client";

import { Children, cloneElement, isValidElement, useCallback, useId, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

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
export function Select({ className, ref, ...props }) {
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
