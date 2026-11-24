// A customizable dashboard (Sean, Nov 2026): each kind of dashboard's sections, and a layout of them (order, hidden,
// collapsed, where each sits) as an administrator's default for the kind and a person's own on top of it. Pure, so
// the dashboard, the Customize panel and the tests share it.

/** Where a section sits: across the page, or in the left or right column beside its neighbours. */
export const PLACES = [["full", "Full width"], ["left", "Left"], ["right", "Right"]];

/** The kinds of dashboard, as an administrator picks whose default to set. */
export const KINDS = [["admin", "Administrators"], ["manager", "Account Managers"], ["client", "Clients"], ["agent", "Agents"]];

/**
 * Each dashboard's sections, in their first order: `wide` for one that wants room (a chart, a calendar, a table);
 * `place` where it sits to begin with.
 */
export const SECTIONS = {
  admin: [
    { id: "tiles", label: "Top tiles", place: "full" },
    { id: "chart", label: "Leads & Appointments Developed", place: "left", wide: true },
    { id: "recent", label: "Recent Leads & Appointments", place: "left", wide: true },
    { id: "schedule", label: "Today's Schedule", place: "right" },
    { id: "reps", label: "Appointments by Rep", place: "right" },
    { id: "production", label: "Daily Production", place: "full" },
    { id: "calls", label: "Call Activity", place: "full" },
  ],
  manager: [
    { id: "tiles", label: "Top tiles", place: "full" },
    { id: "production", label: "Daily Production", place: "left" },
    { id: "schedule", label: "Today's Schedule", place: "right", wide: true },
    { id: "developed", label: "Recent Leads & Appointments", place: "left", wide: true },
    { id: "team", label: "Daily Team Production", place: "right" },
    { id: "calls", label: "Call Activity", place: "full" },
  ],
  client: [
    { id: "tiles", label: "Top tiles", place: "full" },
    { id: "pipeline", label: "Sale Pipeline", place: "left", wide: true },
    { id: "schedule", label: "Calendar", place: "right", wide: true },
    { id: "activity", label: "Recent Activity", place: "full" },
  ],
  agent: [
    { id: "tiles", label: "Top tiles", place: "full" },
    { id: "volume", label: "Lead Volume", place: "left", wide: true },
    { id: "schedule", label: "Today's Schedule", place: "right" },
    { id: "recent", label: "Recent Leads", place: "left", wide: true },
    { id: "reps", label: "Appointments by Rep", place: "right" },
  ],
};

const PLACE_KEYS = PLACES.map(([k]) => k);

/** A layout as stored, kept to the kind's sections and the shapes it may have: { order, hidden, collapsed, place }. */
export function cleanLayout(kind, raw) {
  const ids = new Set((SECTIONS[kind] ?? []).map((s) => s.id));
  const list = (v) => [...new Set((Array.isArray(v) ? v : []).filter((x) => ids.has(x)))];
  const place = {};
  for (const [k, v] of Object.entries(raw?.place && typeof raw.place === "object" ? raw.place : {})) {
    if (ids.has(k) && PLACE_KEYS.includes(v)) place[k] = v;
  }
  return { order: list(raw?.order), hidden: list(raw?.hidden), collapsed: list(raw?.collapsed), place };
}

/**
 * A kind's sections as laid out: its first order, then the administrators' default for the kind, then the person's
 * own (each a layout, or null). A section a layout doesn't name (one added since) keeps its first place among the
 * rest. [{ id, label, wide, place, hidden, collapsed }].
 */
export function resolveLayout(kind, ...layouts) {
  let sections = (SECTIONS[kind] ?? []).map((s) => ({ ...s, hidden: false, collapsed: false }));
  for (const raw of layouts) {
    if (!raw) continue;
    const l = cleanLayout(kind, raw);
    if (l.order.length) {
      const named = l.order.map((id) => sections.find((s) => s.id === id));
      // One not named goes back after the one it followed at first.
      const rest = sections.filter((s) => !l.order.includes(s.id));
      for (const s of rest) {
        const first = SECTIONS[kind].findIndex((x) => x.id === s.id);
        const before = SECTIONS[kind].slice(0, first).map((x) => x.id);
        const at = named.reduce((pos, n, i) => (before.includes(n.id) ? i + 1 : pos), 0);
        named.splice(at, 0, s);
      }
      sections = named;
    }
    // A layout says every section's state: what it hides, the rest shown.
    sections = sections.map((s) => ({ ...s, hidden: l.hidden.includes(s.id), collapsed: l.collapsed.includes(s.id), place: l.place[s.id] ?? s.place }));
  }
  return sections;
}

/** Sections as a layout to store. */
export const layoutOf = (sections) => ({
  order: sections.map((s) => s.id),
  hidden: sections.filter((s) => s.hidden).map((s) => s.id),
  collapsed: sections.filter((s) => s.collapsed).map((s) => s.id),
  place: Object.fromEntries(sections.map((s) => [s.id, s.place])),
});

/**
 * The sections shown, in rows: a full-width one on its own; those between, side by side in a left and a right
 * column, each column as long as its own cards (none stretched to match). A column with a wide section is the wider
 * (2 to 1), both or neither even. [{ full: section } | { left: [section], right: [section], cols: "2fr 1fr" }].
 */
export function rowsOf(sections) {
  const rows = [];
  let block = null;
  for (const s of sections) {
    if (s.hidden) continue;
    if (s.place === "full") {
      block = null;
      rows.push({ full: s });
      continue;
    }
    if (!block) rows.push((block = { left: [], right: [] }));
    block[s.place].push(s);
  }
  for (const r of rows) {
    if (r.full) continue;
    const lw = r.left.some((s) => s.wide) ? 2 : 1;
    const rw = r.right.some((s) => s.wide) ? 2 : 1;
    r.cols = !r.left.length || !r.right.length ? null : lw === rw ? "1fr 1fr" : `${lw}fr ${rw}fr`;
  }
  return rows;
}

/** Whose kind of dashboard a role has. */
export const kindOf = (role) => (role === "admin" ? "admin" : role === "manager" ? "manager" : role === "agent" ? "agent" : "client");
