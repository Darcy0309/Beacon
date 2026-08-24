"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import BeaconLogo from "@/components/logo";
import { navGroups } from "@/lib/nav";
import { cn } from "@/lib/utils";

export default function SidebarNav({ onNavigate }) {
  const path = usePathname();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-sky-400 shadow-md shadow-primary/30">
          <BeaconLogo className="size-5 text-white" />
        </div>
        <div className="leading-tight">
          <div className="font-semibold text-white">Beacon</div>
          <div className="text-[0.62rem] font-medium uppercase tracking-[0.14em] text-sidebar-foreground/55">Signature Mktg</div>
        </div>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="px-2 pb-1 text-[0.62rem] font-semibold uppercase tracking-[0.13em] text-sidebar-foreground/45">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = path === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 active:scale-[0.98]",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                        : "text-sidebar-foreground/80 hover:translate-x-0.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[0.65rem] font-semibold tabular-nums",
                          active ? "bg-white/20 text-white" : "bg-sidebar-accent text-sidebar-foreground"
                        )}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto flex items-center gap-3 border-t border-sidebar-border px-4 py-4">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-xs font-semibold text-white">SF</div>
        <div className="min-w-0 flex-1 text-sm leading-tight">
          <div className="font-medium text-white">Sean F.</div>
          <div className="text-xs text-sidebar-foreground/60">Administrator</div>
        </div>
        <Link
          href="/login"
          onClick={onNavigate}
          title="Sign out"
          aria-label="Sign out"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-white"
        >
          <LogOut className="size-4" />
        </Link>
      </div>
    </div>
  );
}
