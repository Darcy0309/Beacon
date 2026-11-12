import MobileNav from "@/components/layout/mobile-nav";
import ThemeToggle from "@/components/layout/theme-toggle";
import TopbarFrame from "@/components/layout/topbar-frame";
import GlobalSearch from "@/features/search/components/global-search";
import NotificationBell from "@/features/notifications/components/notification-bell";

/**
 * The top of every page (client, Nov 2026): what the page shows on the left (`sub`, with `tag` over it,
 * the dashboard's "Signature Marketing · Lighthouse Platform"), its title in the middle on a tab that
 * hangs below the bar, and search, the theme and notifications on the right. Its shape: topbar-frame.jsx.
 */
export default function Topbar({ title, sub, tag }) {
  return (
    <TopbarFrame
      data-topbar
      left={
        <>
          <MobileNav />
          {tag || sub ? (
            <div className="hidden min-w-0 sm:block">
              {tag ? <div data-topbar-tag className="eyebrow eyebrow-accent truncate">{tag}</div> : null}
              {sub ? <p data-topbar-sub className="truncate text-xs text-muted-foreground">{sub}</p> : null}
            </div>
          ) : null}
        </>
      }
      title={<h1 data-topbar-title className="max-w-[46vw] truncate text-sm font-bold uppercase tracking-[0.16em] sm:max-w-[32rem]">{title}</h1>}
      right={
        <>
          <GlobalSearch />
          <span className="hidden items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/8 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-emerald-400 sm:inline-flex">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-lighthouse-pulse" />
            Live
          </span>
          <ThemeToggle />
          <NotificationBell />
        </>
      }
    />
  );
}
