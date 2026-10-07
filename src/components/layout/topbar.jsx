import MobileNav from "@/components/layout/mobile-nav";
import ThemeToggle from "@/components/layout/theme-toggle";
import GlobalSearch from "@/features/search/components/global-search";
import NotificationBell from "@/features/notifications/components/notification-bell";

/** `tag`: a short line beside the title (the dashboard's "Signature Marketing · Lighthouse Platform"). */
export default function Topbar({ title, sub, tag }) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--panel-border)] bg-background/80 px-4 py-3 backdrop-blur-sm sm:px-6">
      <MobileNav />
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="shrink-0 truncate text-sm font-bold uppercase tracking-[0.16em]">{title}</h1>
          {tag ? <span data-topbar-tag className="eyebrow eyebrow-accent hidden truncate sm:inline">{tag}</span> : null}
        </div>
        {sub ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p> : null}
      </div>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <GlobalSearch />
        <span className="hidden items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/8 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-emerald-400 sm:inline-flex">
          <span className="size-1.5 rounded-full bg-emerald-400 animate-lighthouse-pulse" />
          Live
        </span>
        <ThemeToggle />
        <NotificationBell />
      </div>
    </header>
  );
}
