"use client";

import { memo, useMemo, useState } from "react";
import { Check, Minus, Plus, Search } from "lucide-react";
import { Select } from "@/components/ui/field";
import { branchState, leavesOf, toggleBranch } from "@/lib/list-builder";
import { cn } from "@/lib/utils";

/**
 * The SIC tree as the list vendor's software has it (Sean, Oct 2026): sectors
 * (15-17 Construction) open with + into their 2-digit groups, and those into
 * their codes, each with a box to tick. Ticking a sector or group ticks every
 * code under it; one partly ticked shows a dash. Finding by a code or words
 * shows the matches with what they sit under, opened. Codes the client has
 * asked for before say so. Each code's industry class (Sean's sheet: a
 * grouping across the tree) can be picked whole, and finding matches it too.
 *
 *   tree     buildTree()
 *   picked   a Set of the codes ticked (the codes at the foot of the tree)
 *   onChange a state setter: given the new Set, or a function of the latest one (so quick ticks all count)
 *   before   { code: when } the client asked for before
 */
export default function SicTree({ tree, picked, onChange, before = {} }) {
  const [open, setOpen] = useState(() => new Set());
  const [find, setFind] = useState("");
  const words = find.trim().toLowerCase().split(/\s+/).filter(Boolean);

  // What a search shows: the matches, everything they sit under, and (for a matched branch) all beneath it.
  const shown = useMemo(() => {
    if (!words.length) return null;
    const keep = new Set();
    const hit = (n) => words.every((w) => `${n.code} ${n.name} ${n.class ?? ""}`.toLowerCase().includes(w));
    const walk = (n, ancestors) => {
      if (hit(n)) {
        for (const a of ancestors) keep.add(a.code);
        const all = (x) => { keep.add(x.code); x.children.forEach(all); };
        all(n);
      }
      for (const c of n.children) walk(c, [...ancestors, n]);
    };
    tree.roots.forEach((r) => walk(r, []));
    return keep;
  }, [tree, find]); // eslint-disable-line react-hooks/exhaustive-deps

  // The industry classes, each with its codes, for picking a class whole.
  const classes = useMemo(() => {
    const out = new Map();
    for (const n of tree.byCode.values()) if (n.class && !n.children.length) (out.get(n.class) ?? out.set(n.class, []).get(n.class)).push(n.code);
    return [...out.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [tree]);
  // Each pick starts the class list over at "Choose a class…".
  const [classKey, setClassKey] = useState(0);
  const pickClass = (name) => {
    const codes = classes.find(([c]) => c === name)?.[1] ?? [];
    if (codes.length) onChange((now) => new Set([...now, ...codes]));
    setClassKey((k) => k + 1);
  };

  const toggleOpen = (code) => setOpen((o) => {
    const next = new Set(o);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    return next;
  });

  return (
    <div className="rounded-xl border border-[var(--panel-border)]" data-sic-tree>
      <div className="flex items-center gap-2 border-b border-[var(--panel-border)] px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find an industry by name or code, e.g. roofing or 1761"
          aria-label="Find an industry" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" data-sic-find />
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums" data-sic-picked>{picked.size.toLocaleString()} picked</span>
        {picked.size ? (
          <button type="button" onClick={() => onChange(new Set())} className="shrink-0 text-xs font-semibold text-primary hover:underline">Clear</button>
        ) : null}
      </div>
      {classes.length ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--panel-border)] px-3 py-2 text-xs text-muted-foreground" data-sic-classes>
          <span>Pick a whole industry class:</span>
          <Select key={classKey} defaultValue="" onChange={(e) => pickClass(e.target.value)} aria-label="Industry class" className="h-8 w-auto min-w-64 text-xs" data-sic-class>
            <option value="">Choose a class…</option>
            {classes.map(([name, codes]) => <option key={name} value={name}>{name} ({codes.length})</option>)}
          </Select>
        </div>
      ) : null}
      <div className="max-h-[32rem] overflow-y-auto overscroll-contain p-2">
        {tree.roots.map((n) => (
          <Branch key={n.code} node={n} depth={0} picked={picked} onChange={onChange} open={open} toggleOpen={toggleOpen} shown={shown} before={before} />
        ))}
        {shown && shown.size === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No industry matches “{find}”.</p> : null}
      </div>
    </div>
  );
}

const Branch = memo(function Branch({ node, depth, picked, onChange, open, toggleOpen, shown, before }) {
  if (shown && !shown.has(node.code)) return null;
  const has = node.children.length > 0;
  const expanded = shown ? true : open.has(node.code);
  const state = branchState(node, picked);
  const leaves = has ? leavesOf(node) : [node.code];
  const n = leaves.filter((c) => picked.has(c)).length;
  const was = has ? leaves.some((c) => before[c]) : Boolean(before[node.code]);
  return (
    <div data-sic-node={node.code}>
      <div className="flex items-start gap-1.5 rounded-md py-0.5 pr-2 hover:bg-muted/50" style={{ paddingLeft: depth * 20 + 4 }}>
        {has ? (
          <button type="button" onClick={() => toggleOpen(node.code)} aria-label={`${expanded ? "Close" : "Open"} ${node.code} ${node.name}`} aria-expanded={expanded}
            className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border border-[var(--panel-border)] text-muted-foreground hover:text-foreground" data-sic-open={node.code}>
            {expanded ? <Minus className="size-3" /> : <Plus className="size-3" />}
          </button>
        ) : <span className="size-5 shrink-0" />}
        <button type="button" role="checkbox" aria-checked={state === "all" ? "true" : state === "some" ? "mixed" : "false"}
          onClick={() => onChange((now) => toggleBranch(node, now))} data-sic-tick={node.code}
          className="flex min-w-0 flex-1 items-start gap-2 text-left text-sm">
          <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
            state === "none" ? "border-input" : "border-primary bg-primary text-primary-foreground")}>
            {state === "all" ? <Check className="size-3" /> : state === "some" ? <Minus className="size-3" /> : null}
          </span>
          <span className={cn("min-w-0 flex-1 break-words", node.kind === "sector" ? "font-semibold" : node.kind === "group" ? "font-medium" : "")}>
            <span className="tabular-nums text-muted-foreground">{node.code}</span> · {node.name}
            {has && n ? <span className="ml-1.5 text-xs text-primary">{n} of {leaves.length}</span> : null}
            {was ? <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-px text-[0.65rem] font-semibold text-amber-700 dark:text-amber-400" title="This client has asked for it before" data-sic-before>before</span> : null}
          </span>
        </button>
      </div>
      {has && expanded ? node.children.map((c) => (
        <Branch key={c.code} node={c} depth={depth + 1} picked={picked} onChange={onChange} open={open} toggleOpen={toggleOpen} shown={shown} before={before} />
      )) : null}
    </div>
  );
});
