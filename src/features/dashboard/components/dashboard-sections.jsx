import CollapsedSection from "@/features/dashboard/components/collapsed-section";
import { layoutOf, rowsOf } from "@/lib/dashboard-layout";

/**
 * The dashboard's sections as laid out (Sean, Nov 2026: a customizable dashboard): each full width, or in the left
 * or right column beside its neighbours (each column its own length); hidden ones left out, collapsed ones a title
 * bar. `nodes` { id: what it shows } (a section with nothing to show, Call Activity before the phone line, say, is
 * left out); `editable` whether they're the person's own to change.
 */
export default function DashboardSections({ kind, sections, nodes, editable }) {
  const shown = sections.filter((s) => nodes[s.id]);
  const layout = editable ? layoutOf(sections) : null;
  const one = (s) => (s.collapsed
    ? <CollapsedSection key={s.id} kind={kind} id={s.id} label={s.label} layout={layout} />
    : <div key={s.id} className="min-w-0 space-y-4" data-dash-section={s.id}>{nodes[s.id]}</div>);
  return rowsOf(shown).map((r, i) => (r.full ? one(r.full) : (
    <div key={`row-${i}`} className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[var(--dash-cols)]" style={r.cols ? { "--dash-cols": r.cols } : undefined} data-dash-row={i}>
      {[r.left, r.right].filter((c) => c.length).map((c, j) => (
        <div key={j} className="min-w-0 space-y-4" data-dash-column={j === 0 && r.left.length ? "left" : "right"}>{c.map(one)}</div>
      ))}
    </div>
  )));
}
