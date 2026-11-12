import MobileNav from "@/components/layout/mobile-nav";
import ThemeToggle from "@/components/layout/theme-toggle";
import GlobalSearch from "@/features/search/components/global-search";
import NotificationBell from "@/features/notifications/components/notification-bell";
import { cn } from "@/lib/utils";

// The bar's face and its edge. The bar is 3.5rem high; the title's tab hangs TAB_DROP below it.
const FACE = "bg-background/80 backdrop-blur-sm";
const EDGE = "border-[var(--panel-border)]";
const BAR = 56; // px: h-14
const TAB_DROP = 12; // px
const SLOPE = 14; // px across each of the tab's sloped sides

/**
 * The top of every page (client, Nov 2026): what the page shows on the left (`sub`, with `tag` over it,
 * the dashboard's "Signature Marketing · Lighthouse Platform"), its title in the middle on a tab that
 * hangs below the bar, and search, the theme and notifications on the right.
 */
export default function Topbar({ title, sub, tag }) {
  return (
    <header data-topbar className="sticky top-0 z-40 grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] grid-rows-[3.5rem] items-start">
      <div className={cn("flex h-14 min-w-0 items-center gap-3 border-b pl-4 pr-3 sm:pl-6", FACE, EDGE)}>
        <MobileNav />
        {tag || sub ? (
          <div className="hidden min-w-0 sm:block">
            {tag ? <div data-topbar-tag className="eyebrow eyebrow-accent truncate">{tag}</div> : null}
            {sub ? <p data-topbar-sub className="truncate text-xs text-muted-foreground">{sub}</p> : null}
          </div>
        ) : null}
      </div>

      {/* The title's tab: the bar's edge dips under it, its sides sloped. */}
      <div data-topbar-tab className="flex items-stretch" style={{ height: BAR + TAB_DROP }}>
        <TabSide side="left" />
        <div className={cn("flex min-w-0 items-center border-b px-2 sm:px-4", FACE, EDGE)} style={{ paddingTop: TAB_DROP / 2 }}>
          <h1 data-topbar-title className="max-w-[46vw] truncate text-sm font-bold uppercase tracking-[0.16em] sm:max-w-[32rem]">{title}</h1>
        </div>
        <TabSide side="right" />
      </div>

      <div className={cn("flex h-14 min-w-0 items-center justify-end gap-2 border-b pl-3 pr-4 sm:gap-3 sm:pr-6", FACE, EDGE)}>
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

/** One sloped side of the title's tab: the face cut on the slant, and the edge drawn along it. */
function TabSide({ side }) {
  const left = side === "left";
  return (
    <div aria-hidden className="relative shrink-0" style={{ width: SLOPE }}>
      <div
        className={cn("absolute inset-0", FACE)}
        style={{ clipPath: left ? `polygon(0 0, 100% 0, 100% 100%, 0 calc(100% - ${TAB_DROP}px))` : `polygon(0 0, 100% 0, 100% calc(100% - ${TAB_DROP}px), 0 100%)` }}
      />
      {/* From the bar's foot (its 1px edge, 56px down) to the tab's, as a hairline. */}
      <svg className="absolute inset-0 overflow-visible" width={SLOPE} height={BAR + TAB_DROP} viewBox={`0 0 ${SLOPE} ${BAR + TAB_DROP}`}>
        <line
          x1={left ? 0 : SLOPE} y1={BAR - 0.5}
          x2={left ? SLOPE : 0} y2={BAR + TAB_DROP - 0.5}
          stroke="var(--panel-border)" strokeWidth="1"
        />
      </svg>
    </div>
  );
}
