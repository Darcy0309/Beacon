"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Switch that persists through a server action.
 *
 * Pass `action` (a server action taking FormData with `id` + `field`) and `id`
 * to make it write to the database; without one it behaves as a local toggle.
 */
export default function ToggleSwitch({
  defaultChecked = false,
  name,
  id,
  action,
  field = "enabled",
  disabled = false,
}) {
  const [on, setOn] = useState(defaultChecked);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    const next = !on;
    setOn(next);

    if (!action) {
      if (name) toast(next ? `${name} enabled` : `${name} disabled`);
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", String(id));
      fd.set(field, String(next));
      const res = await action(fd);
      if (res?.ok === false) {
        setOn(!next); // roll back
        toast.error(res.error ?? "Could not save that change.");
      } else if (name) {
        toast.success(next ? `${name} enabled` : `${name} disabled`);
      }
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={name}
      disabled={disabled || pending}
      onClick={handleClick}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60",
        on ? "bg-primary" : "bg-muted-foreground/30"
      )}
    >
      <span
        className={cn(
          "inline-block size-4 transform rounded-full bg-white shadow transition-transform",
          on ? "translate-x-4" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
