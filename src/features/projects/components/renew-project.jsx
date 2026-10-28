"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import DatePicker from "@/components/shared/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { renewalNames, renewProject } from "@/features/projects/renew-actions";
import { reach } from "@/lib/reach";

/**
 * Renew Project (Oct 2026): the program's next term as a new lead project on
 * the same appointment project (the parent of all the client's lead
 * projects), with the same settings and rates; a new name, dates and lead
 * goal; the managers chosen (ProjectA's to start with); and the viable names
 * carried over: all, those matching the list's filters (SIC, state,
 * employees, call result), or none to start with a new list. ProjectA keeps
 * its history (the names carried show as Moved) and is marked Completed.
 *
 *   project: { id, name }  team: [{ id }]  staff: [{ id, name, role }]
 *   filters: the list's search and filters; filterLabel: them, said
 */
export default function RenewProject({ project, team = [], staff = [], filters = {}, filterLabel = "" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [leadGoal, setLeadGoal] = useState("");
  const [leadGoalMonth, setLeadGoalMonth] = useState("");
  const [managers, setManagers] = useState(() => new Set(team.map((r) => r.id)));
  const [names, setNames] = useState("all");
  const [complete, setComplete] = useState(true);
  const [saving, startSaving] = useTransition();

  const openDialog = () => {
    setOpen(true);
    setName(`${project.name} - Renewal`);
    setManagers(new Set(team.map((r) => r.id)));
    setNames("all");
    setCounts(null);
    reach(() => renewalNames(project.id, filters)).then((r) => {
      if (r.ok) setCounts(r.data);
      else { toast.error(r.error); setOpen(false); }
    });
  };
  const toggle = (id) => setManagers((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const carried = names === "all" ? counts?.all ?? 0 : names === "matching" ? counts?.matching ?? 0 : 0;
  const go = () => startSaving(async () => {
    const r = await reach(() => renewProject(project.id, {
      name, start, end, leadGoal, leadGoalMonth, managers: [...managers], names, filters, complete,
    }));
    if (!r.ok) { toast.error(r.error); return; }
    const { moved, project_id: id } = r.data;
    toast.success(`${name.trim()} is set up`, {
      description: `${moved.toLocaleString()} viable name${moved === 1 ? "" : "s"} carried over${managers.size ? ` and shared across ${managers.size} manager${managers.size === 1 ? "" : "s"}` : ""}${complete ? `; ${project.name} is completed` : ""}.`,
    });
    setOpen(false);
    router.push(`/projects/${id}`);
  });

  return (
    <>
      <Button size="sm" variant="outline" onClick={openDialog} data-renew-open><RefreshCw /> Renew project</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto" data-renew-dialog>
          <DialogHeader>
            <DialogTitle>Renew {project.name}</DialogTitle>
            <DialogDescription>
              A new lead project with the same appointment project, settings and rates. {project.name} keeps all its leads,
              appointments and stats; the names carried over show there as Moved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="New project name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} data-renew-name />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Start date" hint="Today when left blank">
                <DatePicker value={start} onChange={setStart} aria-label="Start date" presets={["today"]} />
              </Field>
              <Field label="End date">
                <DatePicker value={end} onChange={setEnd} aria-label="End date" future />
              </Field>
              <Field label="Lead goal" hint="For the whole term">
                <Input value={leadGoal} onChange={(e) => setLeadGoal(e.target.value)} inputMode="numeric" data-renew-goal />
              </Field>
              <Field label="Lead goal a month">
                <Input value={leadGoalMonth} onChange={(e) => setLeadGoalMonth(e.target.value)} inputMode="numeric" data-renew-goal-month />
              </Field>
            </div>

            <fieldset>
              <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Viable names to carry over</legend>
              {counts ? (
                <div className="space-y-1.5 text-sm">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name="renew-names" checked={names === "all"} onChange={() => setNames("all")} className="size-4 accent-[var(--primary)]" data-renew-names="all" />
                    All <strong className="tabular-nums" data-renew-all>{counts.all.toLocaleString()}</strong>
                    <span className="text-muted-foreground">· Viable-No Contact, Staged, Left Message, Email and Pending</span>
                  </label>
                  <label className={`flex items-center gap-2 ${counts.matching == null ? "opacity-50" : "cursor-pointer"}`}>
                    <input type="radio" name="renew-names" checked={names === "matching"} disabled={counts.matching == null} onChange={() => setNames("matching")}
                      className="size-4 accent-[var(--primary)]" data-renew-names="matching" />
                    {counts.matching == null ? (
                      <span>Only some: filter the list below by SIC, state, employees or call result first</span>
                    ) : (
                      <span>The <strong className="tabular-nums" data-renew-matching>{counts.matching.toLocaleString()}</strong> matching the list&apos;s filters
                        {filterLabel ? <span className="text-muted-foreground"> · {filterLabel}</span> : null}</span>
                    )}
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name="renew-names" checked={names === "none"} onChange={() => setNames("none")} className="size-4 accent-[var(--primary)]" data-renew-names="none" />
                    None <span className="text-muted-foreground">· start with a new list</span>
                  </label>
                </div>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Counting the viable names…</p>
              )}
            </fieldset>

            <fieldset>
              <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account managers</legend>
              <div className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto rounded-md border border-[var(--panel-border)] p-2 text-sm sm:grid-cols-2">
                {staff.map((u) => (
                  <label key={u.id} className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={managers.has(u.id)} onChange={() => toggle(u.id)} className="size-4 accent-[var(--primary)]" data-renew-manager={u.id} />
                    <span className="truncate">{u.name}</span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Each is told the new project and how many names they have.</p>
            </fieldset>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} className="size-4 accent-[var(--primary)]" data-renew-complete />
              Mark {project.name} completed
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!name.trim() || !counts || saving} onClick={go} data-renew-go>
              {saving ? <Loader2 className="animate-spin" /> : <RefreshCw />} Renew{carried ? ` with ${carried.toLocaleString()} names` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
