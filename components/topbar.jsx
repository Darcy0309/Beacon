import { Search, Bell } from "lucide-react";
import { Input } from "@/components/ui/input";
import MobileNav from "@/components/mobile-nav";
import ThemeToggle from "@/components/theme-toggle";

export default function Topbar({ title, sub }) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/70 bg-background/75 px-4 py-3.5 backdrop-blur-xl sm:px-6">
      <MobileNav />
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
        {sub ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p> : null}
      </div>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <div className="relative hidden sm:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search leads, clients…"
            aria-label="Search"
            className="w-48 border-border/80 bg-card/80 pl-8 shadow-none transition-[width] duration-300 ease-out hover:w-72 focus:w-80"
          />
        </div>
        <ThemeToggle />
        <button
          className="relative flex size-9 items-center justify-center rounded-lg border border-border/80 bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
          aria-label="Notifications"
        >
          <Bell className="size-4" />
          <span className="absolute right-2 top-2 size-1.5 rounded-full bg-beacon" />
        </button>
      </div>
    </header>
  );
}
