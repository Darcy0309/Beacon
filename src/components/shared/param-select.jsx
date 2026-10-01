"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/**
 * A filter select whose value lives in the URL (?name=), so a filtered
 * report is linkable and the back button works. Changing it also drops the
 * params in `clears`: the page number, and anything that depended on it.
 */
export default function ParamSelect({ name, label, value = "", options, placeholder = "All", clears = ["page"], className }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const onChange = (e) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of clears) params.delete(key);
    if (e.target.value) params.set(name, e.target.value);
    else params.delete(name);
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  return (
    <label className={cn("flex min-w-0 items-center gap-2", className)}>
      <span className="eyebrow shrink-0">{label}</span>
      {/* Keyed by the value, so it shows what the server rendered once the URL settles. */}
      <Select key={value} name={name} defaultValue={value} onChange={onChange} disabled={pending}
        className={cn("h-8 w-auto min-w-0 max-w-64 text-sm", pending && "opacity-60")}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </label>
  );
}
