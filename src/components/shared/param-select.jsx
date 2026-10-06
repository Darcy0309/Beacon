"use client";

import { useId, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// The "all" choice; a menu choice cannot be the empty string.
const ALL = "__all";

/**
 * A filter whose value lives in the URL (?name=), so a filtered report is
 * linkable and the back button works. Changing it also drops the params in
 * `clears`: the page number, and anything that depended on it.
 *
 * A button and a menu rather than a native <select>: the button keeps the
 * choice on one line, cut short with "…" when it is long (a project such as
 * "HeartlandIns-MidwestPros_Appointments_2026"), while the list shows every
 * name in full. Arrow keys, Enter and typing a name's first letters work as
 * in any menu.
 */
export default function ParamSelect({ name, label, value = "", options, placeholder = "All", clears = ["page"], className }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const labelId = useId();

  const current = options.find((o) => String(o.value) === String(value))?.label ?? placeholder;

  const choose = (next) => {
    const chosen = next === ALL ? "" : next;
    if (chosen === String(value ?? "")) return;
    const params = new URLSearchParams(searchParams.toString());
    for (const key of clears) params.delete(key);
    if (chosen) params.set(name, chosen);
    else params.delete(name);
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <span id={labelId} className="eyebrow shrink-0">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={pending}>
          <button
            type="button"
            data-param={name}
            aria-labelledby={`${labelId} ${labelId}-value`}
            className={cn(
              "flex h-8 min-w-0 max-w-[min(20rem,60vw)] cursor-pointer items-center gap-2 rounded-md border border-input bg-background/60 px-2.5 text-sm outline-none transition-colors",
              "hover:border-primary/40 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring/30 data-[state=open]:border-primary/50",
              pending && "opacity-60"
            )}
          >
            <span id={`${labelId}-value`} className="truncate">{current}</span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 [[data-state=open]>&]:rotate-180" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-[min(20rem,60svh)] min-w-[var(--radix-dropdown-menu-trigger-width)] max-w-[min(28rem,92vw)] overflow-y-auto"
        >
          <DropdownMenuRadioGroup value={value ? String(value) : ALL} onValueChange={choose}>
            <DropdownMenuRadioItem value={ALL}>{placeholder}</DropdownMenuRadioItem>
            {options.map((o) => (
              <DropdownMenuRadioItem key={o.value} value={String(o.value)} className="break-words">
                {o.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
