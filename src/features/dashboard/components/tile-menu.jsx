"use client";

import { ChevronDown } from "lucide-react";
import Link from "@/components/shared/intent-link";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { dashboardHref } from "@/features/dashboard/components/period-switch";
import { cn } from "@/lib/utils";

/**
 * A small drop-down on a dashboard tile, as short as its note line (Nov 2026: Conversion's renewal month and
 * year): `options` [[value, label]], the one chosen `current`, kept in the address as `param` with the other
 * tiles' choices (`params`).
 */
export default function TileMenu({ param, current, options, params = {}, label }) {
  const shown = options.find(([v]) => String(v) === String(current))?.[1] ?? current;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={label} data-tile-menu={param}
          className="-my-0.5 inline-flex items-center gap-0.5 rounded-md border border-[var(--panel-border)] bg-background/40 px-1.5 text-[0.6rem] font-semibold uppercase leading-4 tracking-[0.08em] text-primary transition-colors hover:border-primary/40">
          {shown}<ChevronDown className="size-3" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 min-w-24 overflow-y-auto">
        {options.map(([value, text]) => (
          <DropdownMenuItem key={value} asChild>
            <Link href={dashboardHref(params, { [param]: value })} scroll={false} data-tile-option={value}
              className={cn("cursor-pointer text-xs", String(value) === String(current) && "font-semibold text-primary")}>
              {text}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
