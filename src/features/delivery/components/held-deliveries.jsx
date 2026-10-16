"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Send } from "lucide-react";
import Link from "@/components/shared/intent-link";
import ToneBadge from "@/components/shared/tone-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, formHelpers } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { failHeldDelivery, sendHeldDeliveries } from "@/features/delivery/hold-actions";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };
const when = (iso) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Hold one back: what needs fixing goes to its manager. */
function HoldBack({ item, onClose }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(failHeldDelivery, EMPTY);
  const { fe, invalid } = formHelpers(state, null);
  const handled = useRef(null);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) {
      toast.success("Held back: the manager has been told what to fix");
      onClose();
      router.refresh();
    } else if (state?.error && !state?.fieldErrors) toast.error(state.error);
  }, [state, onClose, router]);
  return (
    <Dialog open={Boolean(item)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-hold-back-dialog>
        <DialogHeader>
          <DialogTitle>Hold back {item?.company}?</DialogTitle>
          <DialogDescription>It is not sent to the client. Its manager is told what to fix; once they mark it fixed it goes with the next batch, or you can send it from here.</DialogDescription>
        </DialogHeader>
        <form action={action} noValidate className="flex flex-col gap-4">
          <input type="hidden" name="id" value={item?.id ?? ""} />
          <Field label="What needs fixing" required error={fe("note")}>
            <Textarea name="note" rows={3} maxLength={500} aria-invalid={invalid("note")} autoFocus placeholder="e.g. The decision maker's email is missing" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="destructive" disabled={pending}><Ban /> {pending ? "Holding back…" : "Hold back"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * What waits to go to the client (Sean, Oct 2026): the leads and
 * appointments Settings › Delivery holds in QA, oldest first. Sent one at a
 * time, the ones ticked, or all; held back with a note to the manager. Says
 * how each kind goes out and when the schedule next clears them.
 */
export default function HeldDeliveries({ rows, summary }) {
  const router = useRouter();
  const [picked, setPicked] = useState(new Set());
  const [holding, setHolding] = useState(null);
  const [sending, startSending] = useTransition();
  const ids = rows.map((r) => r.id);
  const allPicked = picked.size > 0 && picked.size === rows.length;
  const toggle = (id) => setPicked((p) => {
    const next = new Set(p);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const send = (which) =>
    startSending(async () => {
      const f = new FormData();
      if (which === "all") f.set("all", "1");
      else for (const id of which) f.append("id", String(id));
      const result = await sendHeldDeliveries(f);
      if (result.ok) {
        toast.success(`${result.data.sent} sent to the client${result.data.sent === 1 ? "" : "s"}`);
        setPicked(new Set());
        router.refresh();
      } else toast.error(result.error);
    });

  return (
    <div data-held-deliveries>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--panel-border)] px-5 py-2.5">
        <p className="text-xs text-muted-foreground" data-delivery-summary>{summary} <Link href="/settings#delivery" className="font-semibold text-primary hover:underline">Change</Link></p>
        {rows.length ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={sending || picked.size === 0} onClick={() => send([...picked])} data-send-picked>
              <Send /> Send {picked.size ? picked.size : ""} selected
            </Button>
            <Button size="sm" disabled={sending} onClick={() => send("all")} data-send-all><Send /> Send all {rows.length}</Button>
          </div>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nothing waiting to go to clients.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="text-left text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                <th className="w-10 px-5 py-2">
                  <input type="checkbox" aria-label="Choose all" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(ids))} className="size-4 accent-[var(--primary)]" />
                </th>
                <th className="px-3 py-2">What</th><th className="px-3 py-2">Company</th><th className="px-3 py-2">Client · Project</th>
                <th className="px-3 py-2">Manager</th><th className="px-3 py-2">Developed</th><th className="px-3 py-2 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--panel-border)]">
              {rows.map((r) => (
                <tr key={r.id} data-held={r.id} data-status={r.status} className={r.status === "failed" ? "bg-rose-500/5" : undefined}>
                  <td className="px-5 py-2.5 align-top">
                    <input type="checkbox" aria-label={`Choose ${r.company}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} className="size-4 accent-[var(--primary)]" />
                  </td>
                  <td className="px-3 py-2.5 align-top"><ToneBadge tone={r.kind === "appointment" ? "violet" : "cyan"}>{r.label}</ToneBadge></td>
                  <td className="px-3 py-2.5 align-top">
                    {r.leadId ? <Link href={`/leads/${r.leadId}`} className="font-medium hover:text-primary">{r.company}</Link> : r.company}
                    {r.place ? <div className="text-xs text-muted-foreground">{r.place}</div> : null}
                    {r.status === "failed" ? (
                      <div className="mt-1 text-xs text-rose-500" data-held-note>Held back: {r.note}{r.fixedAt ? "" : " · waiting for the manager"}</div>
                    ) : r.fixedAt ? <div className="mt-1 text-xs text-emerald-500">Fixed by the manager</div> : null}
                  </td>
                  <td className="px-3 py-2.5 align-top text-muted-foreground">{r.client}<div className="text-xs">{r.project}</div></td>
                  <td className="px-3 py-2.5 align-top">{r.manager}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 align-top tabular-nums text-muted-foreground">{when(r.at)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right align-top">
                    <Button size="sm" variant="ghost" disabled={sending} onClick={() => send([r.id])} data-send-one><Send /> Send</Button>
                    {r.status !== "failed" ? (
                      <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setHolding(r)} data-hold-back><Ban /> Hold back</Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <HoldBack item={holding} onClose={() => setHolding(null)} />
    </div>
  );
}
