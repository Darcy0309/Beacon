"use client";

import { cn } from "@/lib/utils";
import { rowsOf } from "@/lib/dashboard-layout";

/**
 * A rough sketch of the dashboard as laid out (Sean, Nov 2026: "when I change the layout, show a preview: lines for a
 * rough design, only the general structure"): each section an outlined box in its place (across the page, or the left
 * or right column, each column as wide as the dashboard makes it), a hint of what it holds drawn in lines; a collapsed
 * one a thin bar with its title; a hidden one left out. Redrawn as the editor changes. `sections`: as the editor has them.
 */
export default function LayoutPreview({ sections, className }) {
  const rows = rowsOf(sections);
  return (
    <div className={cn("rounded-lg border border-dashed border-[var(--panel-border)] bg-background/40 p-3", className)} data-layout-preview aria-label="Preview of the dashboard layout">
      <p className="mb-2 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Preview</p>
      {rows.length ? (
        <div className="space-y-1.5">
          {rows.map((r, i) => (r.full ? <Box key={r.full.id} s={r.full} /> : (
            <div key={`row-${i}`} className="grid items-start gap-1.5" style={{ gridTemplateColumns: r.cols ?? "1fr" }} data-preview-row>
              {[r.left, r.right].filter((c) => c.length).map((col, j) => (
                <div key={j} className="min-w-0 space-y-1.5">{col.map((s) => <Box key={s.id} s={s} />)}</div>
              ))}
            </div>
          )))}
        </div>
      ) : (
        <p className="py-6 text-center text-xs text-muted-foreground">Every section is hidden: the dashboard would be empty.</p>
      )}
    </div>
  );
}

// The ink of a sketch: the accent, faint.
const ink = "color-mix(in srgb, var(--primary) 45%, var(--muted-foreground))";
const faint = "color-mix(in srgb, var(--primary) 22%, transparent)";

/** One section: its title, and a hint of what it holds. */
function Box({ s }) {
  if (s.collapsed) {
    return (
      <div className="flex h-5 items-center gap-1.5 rounded border border-[var(--panel-border)] px-1.5" data-preview-section={s.id} data-preview-collapsed>
        <span className="h-px w-2" style={{ background: ink }} />
        <span className="truncate text-[0.55rem] text-muted-foreground">{s.label}</span>
      </div>
    );
  }
  return (
    <div className="rounded border px-1.5 pb-1.5 pt-1" style={{ borderColor: ink }} data-preview-section={s.id}>
      <p className="truncate text-[0.55rem] font-semibold text-muted-foreground">{s.label}</p>
      <div className="mt-1"><Sketch id={s.id} /></div>
    </div>
  );
}

/** What a section holds, in a few lines. */
function Sketch({ id }) {
  if (id === "tiles") {
    return (
      <div className="grid grid-cols-4 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-7 rounded-sm border p-1" style={{ borderColor: faint }}>
            <div className="h-1 w-1/2 rounded-full" style={{ background: faint }} />
            <div className="mt-1 h-1.5 w-1/3 rounded-full" style={{ background: ink }} />
          </div>
        ))}
      </div>
    );
  }
  if (["chart", "volume", "pipeline"].includes(id)) {
    return (
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-10 w-full" aria-hidden>
        <path d="M0 29.5H100" stroke={faint} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d="M2 24 L16 18 L28 21 L42 11 L56 15 L70 7 L84 10 L98 4" fill="none" stroke={ink} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
    );
  }
  if (id === "schedule") {
    return (
      <div className="grid grid-cols-7 gap-px">
        {Array.from({ length: 21 }, (_, i) => <div key={i} className="h-1.5 rounded-[1px]" style={{ background: i === 9 ? ink : faint }} />)}
      </div>
    );
  }
  // A list or a table: a few rows.
  return (
    <div className="space-y-1">
      {[90, 75, 82].map((w, i) => <div key={i} className="h-1 rounded-full" style={{ width: `${w}%`, background: i ? faint : ink }} />)}
    </div>
  );
}
