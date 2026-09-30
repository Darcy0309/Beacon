/**
 * Streamed in the instant a navigation starts, before the page's data has
 * arrived. Mirrors the common page skeleton — topbar, four stat tiles, one
 * panel — so the layout does not jump when the real content lands.
 */
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col" aria-busy="true" aria-label="Loading">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--panel-border)] bg-background/85 px-4 py-3 backdrop-blur sm:px-6">
        <div className="space-y-2">
          <div className="h-3.5 w-36 animate-pulse rounded bg-muted" />
          <div className="h-3 w-56 animate-pulse rounded bg-muted/60" />
        </div>
      </header>
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} data-panel className="h-28 animate-pulse rounded-xl border" style={{ animationDelay: `${i * 90}ms` }} />
          ))}
        </div>
        <div data-panel className="animate-pulse rounded-xl border">
          <div className="border-b border-[var(--panel-border)] px-5 py-4">
            <div className="h-3 w-32 rounded bg-muted" />
          </div>
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 rounded bg-muted/50" style={{ width: `${88 - i * 6}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
