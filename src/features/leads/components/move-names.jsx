"use client";

import { createContext, useContext, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { matchingNames, moveNames, moveTargets } from "@/features/leads/transfer-actions";
import { reach } from "@/lib/reach";

/**
 * Moving names to another project (Sean, Oct 2026), instead of exporting
 * them and importing them again: tick names on a project's list (or all
 * that match its search and filters), choose a project of the same kind
 * and the call result they take there. They are copied there and shared out
 * evenly among its reps; the originals are marked Removed (Lead-Removed for
 * leads), so this project's reports stay as they were.
 *
 *   <MovePicker> around the list; <PickBox id> in each row, <PickAll ids> in
 *   the heading; <MoveBar> above it.
 */
const Picked = createContext(null);

export function MovePicker({ children }) {
  const [ids, setIds] = useState(() => new Set());
  const value = useMemo(() => ({
    ids,
    has: (id) => ids.has(id),
    toggle: (id) => setIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    setMany: (list, on) => setIds((s) => { const n = new Set(s); for (const id of list) { if (on) n.add(id); else n.delete(id); } return n; }),
    replace: (list) => setIds(new Set(list)),
    clear: () => setIds(new Set()),
  }), [ids]);
  return <Picked.Provider value={value}>{children}</Picked.Provider>;
}

const box = "size-4 cursor-pointer accent-[var(--primary)]";

export function PickBox({ id, name }) {
  const p = useContext(Picked);
  return <input type="checkbox" className={box} checked={p.has(id)} onChange={() => p.toggle(id)} aria-label={`Pick ${name}`} data-pick={id} />;
}

export function PickAll({ ids }) {
  const p = useContext(Picked);
  const all = ids.length > 0 && ids.every((id) => p.has(id));
  return <input type="checkbox" className={box} checked={all} onChange={() => p.setMany(ids, !all)} aria-label="Pick every name on this page" data-pick-all />;
}

export function MoveBar({ projectId, type, total, filters, results }) {
  const p = useContext(Picked);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState(null);
  const [target, setTarget] = useState("");
  const own = results.filter((r) => r.project_type === type && r.applies_to === "name");
  const start = own.find((r) => r.name === (type === "APPT" ? "Lead-No Contact" : "Viable-CallBack")) ?? own[0];
  const [result, setResult] = useState(start ? String(start.id) : "");
  const [finding, startFinding] = useTransition();
  const [moving, startMoving] = useTransition();
  const n = p.ids.size;
  const kind = type === "APPT" ? "lead" : "name";

  const all = () => startFinding(async () => {
    const r = await reach(() => matchingNames(projectId, filters));
    if (!r.ok) { toast.error(r.error); return; }
    p.replace(r.data.ids);
    if (r.data.ids.length >= 5000) toast.warning("The first 5,000 are picked: move those, then the rest.");
  });
  const openMove = () => {
    setOpen(true);
    if (!targets) {
      reach(() => moveTargets(type)).then((r) => {
        if (r.ok) setTargets(r.data.filter((t) => t.id !== projectId));
        else { toast.error(r.error); setOpen(false); }
      });
    }
  };
  const move = () => startMoving(async () => {
    const r = await reach(() => moveNames([...p.ids], target, result));
    if (!r.ok) { toast.error(r.error); return; }
    const to = targets?.find((t) => String(t.id) === target);
    const { moved, skipped } = r.data;
    if (moved) toast.success(`${moved.toLocaleString()} ${kind}${moved === 1 ? "" : "s"} moved to ${[to?.client, to?.name].filter(Boolean).join(" · ")}`,
      skipped ? { description: `${skipped.toLocaleString()} already on that project (same phone) stayed here.` } : undefined);
    else toast.warning("Nothing moved", { description: `All ${skipped.toLocaleString()} are already on that project (same phone).` });
    setOpen(false);
    p.clear();
    router.refresh();
  });

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--panel-border)] px-5 py-2 text-xs" data-move-bar>
      <span className="text-muted-foreground"><strong className="tabular-nums text-foreground" data-picked-count>{n.toLocaleString()}</strong> picked</span>
      {total > 0 && n < Math.min(total, 5000) ? (
        <button type="button" onClick={all} disabled={finding} className="font-semibold text-primary hover:underline disabled:opacity-60" data-pick-matching>
          {finding ? "Picking…" : `Pick all ${total.toLocaleString()} that match`}
        </button>
      ) : null}
      {n ? <button type="button" onClick={p.clear} className="text-muted-foreground hover:text-foreground" data-pick-clear>Clear</button> : null}
      <Button size="sm" variant="outline" className="ml-auto" disabled={!n} onClick={openMove} data-move-open><ArrowRightLeft /> Move to project</Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg" data-move-dialog>
          <DialogHeader>
            <DialogTitle>Move {n.toLocaleString()} {kind}{n === 1 ? "" : "s"} to another project</DialogTitle>
            <DialogDescription>
              They&apos;re copied there with the call result you choose and shared out evenly among its reps. Here they&apos;re marked {type === "APPT" ? "Lead-Removed" : "Removed"}. A {kind} already on that project (same phone) stays here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label={type === "APPT" ? "Appointment project" : "DB dev project"}>
              <Select value={target} onChange={(e) => setTarget(e.target.value)} disabled={!targets} aria-label="Project to move to" data-move-target>
                <option value="">{targets ? "Choose a project…" : "Loading…"}</option>
                {(targets ?? []).map((t) => <option key={t.id} value={t.id}>{[t.client, t.name].filter(Boolean).join(" · ")}</option>)}
              </Select>
            </Field>
            <Field label="Call result there">
              <Select value={result} onChange={(e) => setResult(e.target.value)} aria-label="Call result there" data-move-result>
                {own.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!target || !result || moving} onClick={move} data-move-go>
              {moving ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />} Move {n.toLocaleString()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
