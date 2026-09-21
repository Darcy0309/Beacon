"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, PanelLeftClose } from "lucide-react";
import LighthouseWordmark from "@/components/logo-wordmark";
import LighthouseMark from "@/components/logo-mark";
import { navGroups, ROLES } from "@/lib/nav";
import { useRole } from "@/components/role-provider";
import { signOut } from "@/lib/actions";
import { useSidebar } from "@/components/sidebar-provider";
import { cn } from "@/lib/utils";

export default function SidebarNav({ onNavigate, forceExpanded = false }) {
  const path = usePathname();
  const { role, user } = useRole();
  const { collapsed: rawCollapsed, toggle } = useSidebar();
  const collapsed = forceExpanded ? false : rawCollapsed;
  const name = user
    ? [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email
    : "Signed out";
  const initials = user
    ? `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}`.toUpperCase() || "?"
    : "?";

  const groups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex h-full flex-col">
      {/* brand + collapse control */}
      {collapsed ? (
        <div className="flex flex-col items-center px-2 py-5">
          {/* The logo itself is the expand control when the rail is collapsed. */}
          <button
            type="button"
            onClick={toggle}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="group rounded-xl outline-none transition-transform duration-150 hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary/60 active:scale-95"
          >
            <LighthouseMark className="size-9 transition-[filter] duration-150 group-hover:drop-shadow-[0_0_10px_var(--primary)]" />
          </button>
        </div>
      ) : (
        <div className="px-4 py-5">
          <div className="flex items-center justify-between gap-2">
            <LighthouseWordmark className="h-9 w-auto text-sidebar-foreground" />
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
          <div className="mt-2 text-[0.6rem] font-bold uppercase leading-[1.5] tracking-[0.2em] text-primary">
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
              <div className="px-2 pb-1.5 pt-1 text-[0.6rem] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/40">
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
                      "relative flex items-center rounded-lg text-sm font-medium transition-all duration-150",
                      collapsed ? "justify-center py-2.5" : "gap-3 px-3 py-2.5",
                      active
                        ? "border border-primary/45 bg-primary/10 text-foreground shadow-[0_0_20px_-6px_var(--primary)]"
                        : "border border-transparent text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "")} />
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {!collapsed && item.badge ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[0.65rem] font-semibold tabular-nums",
                          active ? "bg-primary/20 text-primary" : "bg-sidebar-accent text-sidebar-foreground/70"
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
        <div className={cn("flex items-center gap-3", collapsed && "flex-col gap-2")}>
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--neon-cyan)] to-[var(--neon-blue)] text-xs font-bold text-[var(--background)]">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1 text-sm leading-tight">
              <div className="truncate font-medium text-sidebar-foreground">{name}</div>
              <div className="truncate text-xs text-sidebar-foreground/60">{ROLES[role]?.label}</div>
            </div>
          )}
          <form action={signOut}>
            <button
              type="submit"
              title="Sign out"
              aria-label="Sign out"
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
