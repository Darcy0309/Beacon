import { Search, Bell } from "lucide-react";
import { Input } from "@/components/ui/input";
import MobileNav from "@/components/mobile-nav";
import ThemeToggle from "@/components/theme-toggle";

export default function Topbar({ title, sub }) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--panel-border)] bg-background/90 px-4 py-3 backdrop-blur-sm sm:px-6">
      <MobileNav />
      <div className="min-w-0">
        <h1 className="truncate text-sm font-bold uppercase tracking-[0.16em]">{title}</h1>
        {sub ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p> : null}
      </div>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <div className="relative hidden sm:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search…"
            aria-label="Search"
            className="w-44 pl-8 transition-[width] duration-300 ease-out hover:w-72 focus:w-80"
          />
        </div>
        <span className="hidden items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/8 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-emerald-400 sm:inline-flex">
          <span className="size-1.5 rounded-full bg-emerald-400 animate-lighthouse-pulse" />
          Live
        </span>
        <ThemeToggle />
        <button
          className="relative flex size-9 items-center justify-center rounded-md border border-[var(--panel-border)] bg-card/90 text-muted-foreground transition-all duration-150 hover:border-primary/40 hover:text-primary active:scale-95"
          aria-label="Notifications"
        >
          <Bell className="size-4" />
          <span className="absolute right-2 top-2 size-1.5 rounded-full bg-accent" />
        </button>
      </div>
    </header>
  );
}
