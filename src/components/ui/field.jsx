import { cn } from "@/lib/utils";

export function Label({ className, ...props }) {
  return (
    <label
      className={cn("text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

export function Select({ className, ...props }) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-md border border-input bg-background/60 px-2.5 text-sm outline-none transition-colors focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50",
        "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/30",
        className
      )}
      {...props}
    />
  );
}

/**
 * Label + control stacked, the standard form row used across record forms.
 * Pass `error` to show a validation message beneath the control; pair it with
 * `aria-invalid` on the control itself so the border turns red.
 */
export function Field({ label, children, className, hint, error, required }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label>
        {label}
        {required ? <span className="ml-0.5 text-destructive" aria-hidden>*</span> : null}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-[0.7rem] font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[0.7rem] text-muted-foreground">{hint}</p>
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
