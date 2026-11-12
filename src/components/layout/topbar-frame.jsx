import TopbarEdge from "@/components/layout/topbar-edge";
import { cn } from "@/lib/utils";

// The bar's face and its edge (--topbar-edge, globals.css: tinted so the bar stands apart from the
// page). The bar is 3.5rem high; the title's tab hangs TAB_DROP below it.
const FACE = "bg-background/80 backdrop-blur-sm";
const EDGE = "border-[var(--topbar-edge)]";
const BAR = 56; // px: h-14
const TAB_DROP = 12; // px
const SLOPE = 14; // px across each of the tab's sloped sides

/**
 * The top bar's shape (client, Nov 2026), shared by every page's bar (topbar.jsx) and the loading
 * screen's (page-loader.jsx), so the two match: `left` on the left, `title` in the middle on a tab
 * that hangs below the bar, `right` on the right, and the edge's glow running out from the tab.
 */
export default function TopbarFrame({ left, title, right, className, ...rest }) {
  return (
    <header data-topbar-frame {...rest} className={cn("sticky top-0 z-40 grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] grid-rows-[3.5rem] items-start", className)}>
      <div className={cn("flex h-14 min-w-0 items-center gap-3 border-b pl-4 pr-3 sm:pl-6", FACE, EDGE)}>{left}</div>

      {/* The title's tab: the bar's edge dips under it, its sides sloped. */}
      <div data-topbar-tab className="flex items-stretch" style={{ height: BAR + TAB_DROP }}>
        <TabSide side="left" />
        <div className={cn("flex min-w-0 items-center border-b px-2 sm:px-4", FACE, EDGE)} style={{ paddingTop: TAB_DROP / 2 }}>{title}</div>
        <TabSide side="right" />
      </div>

      <div className={cn("flex h-14 min-w-0 items-center justify-end gap-2 border-b pl-3 pr-4 sm:gap-3 sm:pr-6", FACE, EDGE)}>{right}</div>

      {/* A glow running out along the edge from the tab. */}
      <TopbarEdge bar={BAR} drop={TAB_DROP} slope={SLOPE} />
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
          stroke="var(--topbar-edge)" strokeWidth="1"
        />
      </svg>
    </div>
  );
}
