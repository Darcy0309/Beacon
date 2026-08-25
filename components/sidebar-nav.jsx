"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, PanelLeft, PanelLeftClose } from "lucide-react";
import BeaconWordmark from "@/components/logo-wordmark";
import BeaconMark from "@/components/logo-mark";
import { navGroups, ROLES } from "@/lib/nav";
import { useRole } from "@/components/role-provider";
import { useSidebar } from "@/components/sidebar-provider";
import { cn } from "@/lib/utils";

export default function SidebarNav({ onNavigate, forceExpanded = false }) {
  const path = usePathname();
  const { role, setRole } = useRole();
  const { collapsed: rawCollapsed, toggle } = useSidebar();
  const collapsed = forceExpanded ? false : rawCollapsed;

  const groups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex h-full flex-col">
      {/* brand + collapse control */}
      {collapsed ? (
        <div className="flex flex-col items-center gap-3 px-2 py-5">
          <BeaconMark className="size-9" />
          <button
            onClick={toggle}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="flex size-8 items-center justify-center rounded-md text-sidebar-foreground/55 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground active:scale-95"
          >
            <PanelLeft className="size-4" />
          </button>
        </div>
      ) : (
        <div className="px-4 py-5">
          <div className="flex items-center justify-between gap-2">
            <BeaconWordmark className="h-9 w-auto text-sidebar-foreground" />
            {!forceExpanded && (
              <button
                onClick={toggle}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/55 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground active:scale-95"
              >
                <PanelLeftClose className="size-4" />
              </button>
            )}
          </div>
          <div className="mt-1.5 text-[0.6rem] font-medium uppercase tracking-[0.14em] text-sidebar-foreground/55">
            Signature Marketing
          </div>
        </div>
      )}

      <nav className={cn("flex-1 space-y-4 overflow-y-auto overflow-x-hidden pb-4", collapsed ? "px-2" : "px-3")}>
        {groups.map((group) => (
          <div key={group.label}>
            {collapsed ? (
              <div className="mx-auto mb-1 h-px w-6 bg-sidebar-border" />
            ) : (
              <div className="px-2 pb-1 text-[0.62rem] font-semibold uppercase tracking-[0.13em] text-sidebar-foreground/45">
                {group.label}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = path === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "flex items-center rounded-lg text-sm font-medium transition-colors",
                      collapsed ? "justify-center py-2.5" : "gap-3 px-3 py-2",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {!collapsed && item.badge ? (
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

      <div className={cn("border-t border-sidebar-border", collapsed ? "flex flex-col items-center gap-2 p-2" : "p-3")}>
        {!collapsed && (
          <>
            <label className="mb-1.5 block px-1 text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/45">
              Viewing as (demo)
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              aria-label="Switch role"
              className="mb-3 w-full rounded-md border border-sidebar-border bg-sidebar-accent/60 px-2.5 py-1.5 text-sm text-sidebar-foreground outline-none focus:ring-2 focus:ring-sidebar-ring"
            >
              {Object.entries(ROLES).map(([key, r]) => (
                <option key={key} value={key}>
                  {r.label}
                </option>
              ))}
            </select>
          </>
        )}

        <div className={cn("flex items-center gap-3", collapsed && "flex-col gap-2")}>
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-xs font-semibold text-white">SF</div>
          {!collapsed && (
            <div className="min-w-0 flex-1 text-sm leading-tight">
              <div className="font-medium text-sidebar-foreground">Sean F.</div>
              <div className="truncate text-xs text-sidebar-foreground/60">{ROLES[role]?.label}</div>
            </div>
          )}
          <Link
            href="/login"
            onClick={onNavigate}
            title="Sign out"
            aria-label="Sign out"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
