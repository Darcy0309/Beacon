"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightLeft, Loader2, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { transferChoices, transferLead } from "@/features/leads/transfer-actions";
import { reach } from "@/lib/reach";

/**
 * Transfer a lead to another client (Sean, Oct 2026), for one the client it
 * was for can't use: the same business already on another client's list
 * (by phone, or name and place) to put back on it; clients whose office is
 * within a radius of the lead (or a ZIP or city typed), nearest first; or
 * any appointment project. The original becomes Lead-Removed, the new record
 * Lead-No Contact with the original's client notes in its internal notes,
 * and it opens, to set the appointment there.
 */
export default function TransferDialog({ lead }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState(null);
  const [from, setFrom] = useState("");
  const [miles, setMiles] = useState("50");
  const [other, setOther] = useState("");
  const [loading, startLoading] = useTransition();
  const [moving, startMoving] = useTransition();

  const load = (opts = {}) => startLoading(async () => {
    const r = await reach(() => transferChoices(lead.id, { from: opts.from ?? from, miles: opts.miles ?? miles }));
    if (!r.ok) { toast.error(r.error); return; }
    setChoices(r.data);
    if (r.data.fromError && (opts.from ?? from)) toast.error(r.data.fromError);
  });
  useEffect(() => {
    if (open && !choices) load({ from: "", miles: "50" });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (projectId, intoId = null, label = "") => startMoving(async () => {
    const r = await reach(() => transferLead(lead.id, projectId, intoId));
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(`Transferred${label ? ` to ${label}` : ""}`, { description: "The original is marked Lead-Removed; this record is Lead-No Contact." });
    setOpen(false);
    router.push(`/leads/${r.data.id}`);
  });
  const name = (p) => [p.client, p.name].filter(Boolean).join(" · ");

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setChoices(null); setOther(""); } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" data-transfer-lead><ArrowRightLeft /> Transfer</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl" data-transfer-dialog>
        <DialogHeader>
          <DialogTitle>Transfer this lead to another client</DialogTitle>
          <DialogDescription>
            {lead.co}: it becomes Lead-Removed here, and Lead-No Contact on the client you choose, with its details, coverage and client notes (in the internal notes). No new Lead pay.
          </DialogDescription>
        </DialogHeader>

        {!choices ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Looking for clients…</p>
        ) : (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
            <section data-transfer-matches>
              <h3 className="eyebrow mb-2">Already on another client&apos;s list</h3>
              {choices.matches.length ? (
                <ul className="divide-y divide-[var(--panel-border)] rounded-lg border border-[var(--panel-border)]">
                  {choices.matches.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm" data-transfer-match={m.id}>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{m.company} <span className="text-xs font-normal text-muted-foreground">· {[m.city, m.state].filter(Boolean).join(", ")} · same {m.by}</span></div>
                        <div className="text-xs text-muted-foreground">{m.project} · {m.result}</div>
                      </div>
                      <Button size="sm" variant="outline" disabled={moving} onClick={() => go(m.project_id, m.id, m.project)} data-transfer-into={m.id}>Use this record</Button>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">Not on any other active client&apos;s list (by phone, or name and place).</p>}
            </section>

            <section data-transfer-nearby>
              <h3 className="eyebrow mb-2">Clients nearby</h3>
              <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); load(); }}>
                <Field label="Within (miles)" className="w-28"><Input inputMode="numeric" value={miles} onChange={(e) => setMiles(e.target.value.replace(/\D/g, ""))} data-transfer-miles /></Field>
                <Field label="Of (ZIP or city)" className="min-w-40 flex-1"><Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder={choices.from ? `${choices.from} (the lead's)` : "e.g. 85201 or Mesa, AZ"} data-transfer-from /></Field>
                <Button type="submit" size="sm" variant="outline" disabled={loading} data-transfer-find>{loading ? <Loader2 className="animate-spin" /> : <Search />} Find</Button>
              </form>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {choices.from ? <>From {choices.from}, to each client&apos;s office ZIP.</> : choices.fromError}
              </p>
              {choices.nearby.length ? (
                <ul className="mt-2 divide-y divide-[var(--panel-border)] rounded-lg border border-[var(--panel-border)]">
                  {choices.nearby.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm" data-transfer-near={p.id}>
                      <MapPin className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{name(p)}</div>
                        <div className="text-xs text-muted-foreground">{[p.city, p.state].filter(Boolean).join(", ")} {p.zip}</div>
                      </div>
                      <span className="shrink-0 text-xs font-semibold tabular-nums" data-transfer-miles-away>{p.miles} mi</span>
                      <Button size="sm" disabled={moving} onClick={() => go(p.id, null, name(p))} data-transfer-to={p.id}>Transfer here</Button>
                    </li>
                  ))}
                </ul>
              ) : choices.from ? <p className="mt-2 text-sm text-muted-foreground">No client&apos;s office within {choices.miles} miles. Try a wider radius, or pick one below.</p> : null}
            </section>

            <section data-transfer-any>
              <h3 className="eyebrow mb-2">Any appointment project</h3>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Project" className="min-w-56 flex-1">
                  <Select value={other} onChange={(e) => setOther(e.target.value)} aria-label="Appointment project" data-transfer-project>
                    <option value="">Choose a project…</option>
                    {choices.projects.map((p) => <option key={p.id} value={p.id}>{name(p)}{p.miles != null ? ` (${p.miles} mi)` : p.hasOffice ? "" : " (no office ZIP)"}</option>)}
                  </Select>
                </Field>
                <Button size="sm" disabled={!other || moving} onClick={() => go(other, null, name(choices.projects.find((p) => String(p.id) === other) ?? {}))} data-transfer-go>
                  {moving ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />} Transfer
                </Button>
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
