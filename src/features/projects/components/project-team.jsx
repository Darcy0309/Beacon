"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Shuffle, UserMinus, UserPlus, Users } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { redistributeProject, setProjectRep } from "@/features/projects/actions";

const form = (entries) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, String(v));
  return f;
};

/**
 * The reps on a project: what each has left to call and what they have done
 * today and this month. Administrators and account managers can put
 * someone on the project or take them off; either way the names still to
 * call are shared out evenly again (set_project_rep()).
 */
export default function ProjectTeam({ projectId, team, staff, canManage, canOpenLists, unassigned, namesLeft }) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(null); // what is running: "add", "share" or a rep's id
  const [adding, setAdding] = useState("");
  const [confirming, setConfirming] = useState(null);

  const onTeam = new Set(team.map((r) => r.id));
  const candidates = staff.filter((s) => !onTeam.has(s.id));

  const run = (key, action, data, success) => {
    setBusy(key);
    startTransition(async () => {
      const res = await action(form(data));
      setBusy(null);
      setConfirming(null);
      if (!res?.ok) {
        toast.error(res?.error ?? "That did not work. Try again.");
        return;
      }
      toast.success(success, { description: res.data?.message });
      if (key === "add") setAdding("");
    });
  };

  const add = () => {
    const person = candidates.find((s) => String(s.id) === adding);
    if (person) run("add", setProjectRep, { project_id: projectId, user_id: person.id, on: 1 }, `${person.name} is on this project`);
  };

  return (
    <Card>
      <SectionHeader
        label="Reps on this Project"
        icon={Users}
        action={
          canManage && team.length ? (
            <Button size="sm" variant="outline" disabled={pending}
              onClick={() => run("share", redistributeProject, { project_id: projectId }, "Names shared out evenly")}>
              {busy === "share" ? <Loader2 className="animate-spin" /> : <Shuffle />} Share names evenly
            </Button>
          ) : null
        }
      />

      {team.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rep</TableHead>
              <TableHead className="text-right">Names left</TableHead>
              <TableHead className="text-right">Leads held</TableHead>
              <TableHead className="text-right">Calls today</TableHead>
              <TableHead className="text-right">Calls this month</TableHead>
              <TableHead className="text-right">Appts this month</TableHead>
              <TableHead>Last worked</TableHead>
              {canManage || canOpenLists ? <TableHead className="text-right">Action</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {team.map((r) => (
              <TableRow key={r.id} data-rep={r.id}>
                <TableCell>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs capitalize text-muted-foreground">{r.role}{r.active ? "" : " · not active"}</div>
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{r.namesLeft.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{r.leadsHeld.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{r.callsToday.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{r.callsMonth.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{r.apptsMonth.toLocaleString()}</TableCell>
                <TableCell className="text-muted-foreground">{r.lastWorked}</TableCell>
                {canManage || canOpenLists ? (
                  <TableCell className="text-right">
                    {confirming === r.id ? (
                      <span className="inline-flex flex-wrap items-center justify-end gap-2">
                        <span className="text-xs text-muted-foreground">
                          {r.namesLeft ? `Their ${r.namesLeft.toLocaleString()} names go to the others.` : "Take them off?"}
                        </span>
                        <Button size="sm" variant="destructive" disabled={pending}
                          onClick={() => run(r.id, setProjectRep, { project_id: projectId, user_id: r.id, on: 0 }, `${r.name} is off this project`)}>
                          {busy === r.id ? <Loader2 className="animate-spin" /> : null} Remove
                        </Button>
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(null)}>Keep</Button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-end gap-1">
                        {canOpenLists ? (
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/work/${projectId}?rep=${r.id}`}>Open list</Link>
                          </Button>
                        ) : null}
                        {canManage ? (
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(r.id)}
                            aria-label={`Take ${r.name} off this project`} title="Take off this project">
                            <UserMinus />
                          </Button>
                        ) : null}
                      </span>
                    )}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          Nobody works this project yet{namesLeft ? `, so its ${namesLeft.toLocaleString()} names to call are waiting` : ""}.
        </p>
      )}

      {canManage ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--panel-border)] px-5 py-3">
          <label className="sr-only" htmlFor={`add-rep-${projectId}`}>Add a rep</label>
          <Select id={`add-rep-${projectId}`} value={adding} onChange={(e) => setAdding(e.target.value)} className="h-8 w-auto min-w-56 text-sm" disabled={pending || !candidates.length}>
            <option value="">{candidates.length ? "Add a rep…" : "Every active rep is on this project"}</option>
            {candidates.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}
          </Select>
          <Button size="sm" disabled={pending || !adding} onClick={add}>
            {busy === "add" ? <Loader2 className="animate-spin" /> : <UserPlus />} Add to project
          </Button>
          <p className="text-xs text-muted-foreground">
            Adding or taking someone off shares the {namesLeft.toLocaleString()} names still to call evenly again.
            {unassigned ? ` ${unassigned.toLocaleString()} are waiting for a rep.` : ""}
          </p>
        </div>
      ) : null}
    </Card>
  );
}
