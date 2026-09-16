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
        "h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

/** Label + control stacked, the standard form row used across record forms. */
export function Field({ label, children, className, hint }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-[0.7rem] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
