"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { saveDashboardLayout } from "@/features/dashboard/actions";
import { KINDS, PLACES, layoutOf, resolveLayout } from "@/lib/dashboard-layout";
import { reach } from "@/lib/reach";

/**
 * Customize (Sean, Nov 2026: "Is it possible to make the dashboard customizable … so each person can set it up how
 * they like?"): each section shown or hidden, collapsed to its title, moved up or down, and full width or in the
 * left or right column; kept to the person's login. Back to default undoes theirs. An administrator also sets each
 * kind of dashboard's default, which everyone's starts from.
 *
 * `kind` the dashboard's; `mine` its sections as the person has them (null when it isn't theirs: an administrator
 * viewing a manager's); `defaults` { kind: layout } for an administrator, else null.
 */
export default function CustomizeDashboard({ kind, mine, defaults }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const targets = useMemo(() => [
    ...(mine ? [["mine", "My dashboard"]] : []),
    ...(defaults ? KINDS.map(([k, label]) => [`default:${k}`, `Default for ${label}`]) : []),
  ], [mine, defaults]);
  const first = mine ? "mine" : `default:${kind}`;
  const [target, setTarget] = useState(first);
  const sectionsFor = (t) => (t === "mine" ? mine : resolveLayout(t.slice(8), defaults?.[t.slice(8)] ?? null));
  const [sections, setSections] = useState(() => sectionsFor(first));
  const [pending, start] = useTransition();

  const choose = (t) => { setTarget(t); setSections(sectionsFor(t)); };
  const change = (id, patch) => setSections((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const move = (i, by) => setSections((list) => {
    const next = [...list];
    const [s] = next.splice(i, 1);
    next.splice(i + by, 0, s);
    return next;
  });
  const save = (layout) => start(async () => {
    const scope = target === "mine" ? "mine" : "default";
    const k = target === "mine" ? kind : target.slice(8);
    const result = await reach(() => saveDashboardLayout({ kind: k, scope, layout }));
    if (!result.ok) return void toast.error(result.error);
    toast.success(layout ? (scope === "mine" ? "Your dashboard is saved" : "The default layout is saved") : (scope === "mine" ? "Your dashboard is back to the default" : "The default is back to the original layout"));
    setOpen(false);
    router.refresh();
  });

  if (!targets.length) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) choose(first); }}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" data-customize-dashboard><SlidersHorizontal /> Customize</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl" data-customize-dialog>
        <DialogHeader>
          <DialogTitle>Customize the dashboard</DialogTitle>
          <DialogDescription>
            Show or hide each section, collapse it to its title, move it up or down, and put it across the page or in the left or right column.
          </DialogDescription>
        </DialogHeader>
        {targets.length > 1 ? (
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Layout for</span>
            <Select value={target} onChange={(e) => choose(e.target.value)} className="w-auto" data-customize-target>
              {targets.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </Select>
          </label>
        ) : null}
        {target !== "mine" ? (
          <p className="text-xs text-muted-foreground" data-customize-default-note>
            What everyone with this dashboard starts from. Anyone who has customized their own keeps theirs until they choose Back to default.
          </p>
        ) : null}
        <ol className="divide-y divide-[var(--panel-border)] rounded-lg border border-[var(--panel-border)]">
          {sections.map((s, i) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 text-sm" data-customize-section={s.id}>
              <span className="flex gap-0.5">
                <Button type="button" size="icon" variant="ghost" className="size-7" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${s.label} up`} data-move-up>
                  <ArrowUp />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="size-7" disabled={i === sections.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${s.label} down`} data-move-down>
                  <ArrowDown />
                </Button>
              </span>
              <span className={`min-w-40 flex-1 font-medium ${s.hidden ? "text-muted-foreground line-through" : ""}`}>{s.label}</span>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={!s.hidden} onChange={(e) => change(s.id, { hidden: !e.target.checked })} data-show /> Show
              </label>
              <label className={`flex items-center gap-1.5 ${s.hidden ? "opacity-50" : ""}`}>
                <input type="checkbox" checked={s.collapsed} disabled={s.hidden} onChange={(e) => change(s.id, { collapsed: e.target.checked })} data-collapse /> Collapsed
              </label>
              <Select value={s.place} disabled={s.hidden || s.id === "tiles"} onChange={(e) => change(s.id, { place: e.target.value })} className="h-8 w-32" aria-label={`Where ${s.label} sits`} data-place>
                {PLACES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </Select>
            </li>
          ))}
        </ol>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => save(null)} disabled={pending} data-customize-reset>
            <RotateCcw /> {target === "mine" ? "Back to default" : "Back to the original"}
          </Button>
          <span className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" onClick={() => save(layoutOf(sections))} disabled={pending} data-customize-save>
              {pending ? <Loader2 className="animate-spin" /> : null} Save
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
