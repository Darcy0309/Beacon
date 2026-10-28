"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePicked } from "@/features/leads/components/move-names";
import { markNames } from "@/features/removals/actions";
import { reach } from "@/lib/reach";
import { REMOVAL_REASONS } from "@/lib/dedupe";

const SAID = {
  deletion: "Not a name you want.",
  dont_call: "Do not call this business.",
  current_customer: "Already your customer.",
};

/**
 * Taking names off a client's lists (Oct 2026): why (Deletion unless they
 * say, so marking names off stays one click) and a note if they like. They
 * are remembered, and a list pulled later for the client leaves them out.
 */
function MarkDialog({ open, onOpenChange, ids, onDone }) {
  const router = useRouter();
  const [reason, setReason] = useState("deletion");
  const [note, setNote] = useState("");
  const [saving, startSaving] = useTransition();
  const n = ids.length;

  const go = () => startSaving(async () => {
    const r = await reach(() => markNames(ids, reason, note));
    if (!r.ok) { toast.error(r.error); return; }
    const { marked, kept } = r.data;
    if (marked) toast.success(`${marked.toLocaleString()} name${marked === 1 ? "" : "s"} taken off · ${r.data.reason}`,
      { description: `${kept ? `${kept.toLocaleString()} with an appointment stayed as ${kept === 1 ? "it is" : "they are"}. ` : ""}They won't come back on a new list.` });
    else toast.warning("Nothing taken off", { description: "Those names have an appointment: ask your account manager." });
    onOpenChange(false);
    setNote("");
    setReason("deletion");
    onDone?.();
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-mark-dialog>
        <DialogHeader>
          <DialogTitle>Take {n === 1 ? "this name" : `${n.toLocaleString()} names`} off your list</DialogTitle>
          <DialogDescription>
            They aren&apos;t called again, and they&apos;re left off any list we pull for you later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Why</legend>
            {REMOVAL_REASONS.map((r) => (
              <label key={r.value} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)}
                  className="size-4 accent-[var(--primary)]" data-mark-reason={r.value} />
                <span className="font-medium">{r.label}</span>
                <span className="text-muted-foreground">· {SAID[r.value]}</span>
              </label>
            ))}
          </fieldset>
          <Field label="Note" hint="Optional">
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. we insure them already" data-mark-note />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!n || saving} onClick={go} data-mark-go>
            {saving ? <Loader2 className="animate-spin" /> : <UserX />} Take off {n === 1 ? "" : n.toLocaleString()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Above a project's list, for a client's people: the names they tick, off. */
export function MarkBar() {
  const p = usePicked();
  const [open, setOpen] = useState(false);
  const n = p.ids.size;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--panel-border)] px-5 py-2 text-xs" data-mark-bar>
      <span className="text-muted-foreground">
        {n ? <><strong className="tabular-nums text-foreground" data-picked-count>{n.toLocaleString()}</strong> picked</> : "Tick names you don't want called"}
      </span>
      {n ? <button type="button" onClick={p.clear} className="text-muted-foreground hover:text-foreground" data-pick-clear>Clear</button> : null}
      <Button size="sm" variant="outline" className="ml-auto" disabled={!n} onClick={() => setOpen(true)} data-mark-open><UserX /> Take off list</Button>
      <MarkDialog open={open} onOpenChange={setOpen} ids={[...p.ids]} onDone={p.clear} />
    </div>
  );
}

/** On a lead sheet, for a client's people: this one name, off. */
export function MarkLeadButton({ leadId }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-mark-lead><UserX /> Take off list</Button>
      <MarkDialog open={open} onOpenChange={setOpen} ids={[leadId]} />
    </>
  );
}
