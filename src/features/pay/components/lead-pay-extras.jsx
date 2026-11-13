"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BadgeDollarSign, Check, FileCheck2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { decideSpecialPay, requestSpecialPay, setDecSheet } from "@/features/pay/extras-actions";
import { reach } from "@/lib/reach";
import { shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const usd = (v) => `$${Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\.00$/, "")}`;
const form = (fields) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v != null) f.set(k, String(v));
  return f;
};

/**
 * "Dec sheet received" (Sean, Nov 2026): ticked once the prospect's policy information is attached to
 * the lead (its Files), it pays the one who ticks it the project's dec sheet rate, once a lead.
 *
 *   marked     { at, by } when ticked, else null
 *   rate       the project's dec sheet rate
 *   canUntick  whoever ticked it, or an administrator
 */
export function DecSheetToggle({ leadId, marked = null, rate = 10, canUntick = false }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const on = Boolean(marked);
  const flip = () =>
    start(async () => {
      const result = await reach(() => setDecSheet(form({ lead_id: leadId, on: on ? 0 : 1 })));
      if (!result?.ok) return void toast.error(result?.error || "The dec sheet could not be marked.");
      toast.success(on ? "Dec sheet unmarked" : `Dec sheet received${result.data?.paid ? `: ${usd(result.data.paid)} added to your pay` : ""}`);
      router.refresh();
    });
  return (
    <div data-dec-sheet={on ? "on" : "off"}
      className={cn("mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm",
        on ? "border-emerald-500/40 bg-emerald-500/5" : "border-[var(--panel-border)] bg-muted/20")}>
      <label className={cn("flex items-center gap-2 font-medium", (on && !canUntick) || pending ? "cursor-default" : "cursor-pointer")}>
        <input type="checkbox" checked={on} disabled={pending || (on && !canUntick)} onChange={flip} className="size-4 accent-[var(--primary)]" data-dec-sheet-box />
        <FileCheck2 className="size-4 text-muted-foreground" /> Dec sheet received
        {pending ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
      </label>
      <span className="text-xs text-muted-foreground">
        {on ? `${marked.by ? `${marked.by} · ` : ""}${shortDate(marked.at)} · ${usd(rate)} Dec Sheet Pay`
          : `Attach the prospect's policy information below, then tick it: ${usd(rate)} Dec Sheet Pay, once a lead.`}
      </span>
    </div>
  );
}

const STATUS = {
  pending: { label: "Waiting", cls: "border-amber-400/40 bg-amber-400/10 text-amber-300" },
  approved: { label: "Approved", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" },
  declined: { label: "Declined", cls: "border-stone-400/30 bg-stone-400/10 text-stone-400" },
};

/**
 * Special Pay requests on a lead (Sean, Nov 2026): a manager asks the project's Sales Rep for an amount
 * over the usual rates; the Sales Rep (or an administrator) approves it, as asked or adjusted, or
 * declines it. Approved, it is added to the manager's pay for the period.
 *
 *   requests   [{ id, amount, approvedAmount, reason, status, note, by, decider, decidedBy, at, canDecide }]
 *   canAsk     staff who can see the lead
 *   decider    who a new request goes to ("Rachel Colestock", or null: the administrators)
 */
export function SpecialPayRequests({ leadId, requests = [], canAsk = false, decider = null }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [errors, setErrors] = useState({});
  const [pending, start] = useTransition();

  const ask = (event) => {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    f.set("lead_id", String(leadId));
    start(async () => {
      const result = await reach(() => requestSpecialPay(f));
      if (!result?.ok) {
        setErrors(result?.fieldErrors ?? {});
        if (!result?.fieldErrors) toast.error(result?.error || "The request could not be sent.");
        return;
      }
      toast.success(`Special Pay request sent to ${decider ?? "the administrators"}`);
      setErrors({});
      setAsking(false);
      router.refresh();
    });
  };

  return (
    <div id="special-pay" data-special-pay className="space-y-3">
      {requests.length ? (
        <ul className="space-y-2">
          {requests.map((q) => <RequestRow key={q.id} leadId={leadId} q={q} />)}
        </ul>
      ) : !asking ? (
        <p className="text-sm text-muted-foreground">No Special Pay asked for on this lead.</p>
      ) : null}

      {canAsk && !asking ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setAsking(true)} data-special-pay-ask>
          <BadgeDollarSign /> Request Special Pay
        </Button>
      ) : null}
      {asking ? (
        <form onSubmit={ask} noValidate className="space-y-3 rounded-lg border border-[var(--panel-border)] p-3" data-special-pay-form>
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <Field label="Amount" required error={errors.amount}>
              <Input name="amount" inputMode="decimal" placeholder="$25" aria-invalid={errors.amount ? true : undefined} autoFocus />
            </Field>
            <Field label="What it's for" required error={errors.reason}>
              <Input name="reason" maxLength={500} placeholder="e.g. Owner meeting set across two locations" aria-invalid={errors.reason ? true : undefined} />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">Goes to {decider ? <span className="font-medium text-foreground">{decider}</span> : "the administrators"} to approve, adjust or decline.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { setAsking(false); setErrors({}); }} disabled={pending}>Cancel</Button>
            <Button type="submit" size="sm" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null} Send request</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function RequestRow({ leadId, q }) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(q.amount));
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const status = STATUS[q.status] ?? STATUS.pending;
  const decide = (approve) =>
    start(async () => {
      const result = await reach(() => decideSpecialPay(form({ request_id: q.id, lead_id: leadId, approve: approve ? 1 : 0, amount: approve ? amount : null, note })));
      if (!result?.ok) return void toast.error(result?.error || "The request could not be decided.");
      toast.success(approve ? `Approved: ${usd(result.data?.amount)} added to ${q.by}'s pay` : "Declined");
      router.refresh();
    });
  return (
    <li className="rounded-lg border border-[var(--panel-border)] p-3 text-sm" data-special-pay-request={q.status}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold tabular-nums">{usd(q.status === "approved" ? q.approvedAmount : q.amount)}</span>
        {q.status === "approved" && Number(q.approvedAmount) !== Number(q.amount) ? (
          <span className="text-xs text-muted-foreground line-through tabular-nums">{usd(q.amount)}</span>
        ) : null}
        <span className={cn("rounded-full border px-2 py-0.5 text-[0.66rem] font-semibold uppercase tracking-wide", status.cls)}>{status.label}</span>
        <span className="text-xs text-muted-foreground">{q.by} · {shortDate(q.at)}{q.status === "pending" && q.decider ? ` · to ${q.decider}` : ""}</span>
      </div>
      <p className="mt-1">{q.reason}</p>
      {q.status !== "pending" ? (
        <p className="mt-1 text-xs text-muted-foreground">{q.status === "approved" ? "Approved" : "Declined"} by {q.decidedBy ?? "—"}{q.note ? ` · ${q.note}` : ""}</p>
      ) : q.canDecide ? (
        <div className="mt-2 flex flex-wrap items-end gap-2" data-special-pay-decide>
          <Field label="Amount">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="w-24" aria-label="Amount approved" />
          </Field>
          <Field label="Note" className="min-w-40 flex-1">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={1} maxLength={500} placeholder="Optional" aria-label="Note" className="min-h-9" />
          </Field>
          <Button type="button" size="sm" onClick={() => decide(true)} disabled={pending} data-special-pay-approve><Check /> Approve</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => decide(false)} disabled={pending} data-special-pay-decline><X /> Decline</Button>
        </div>
      ) : null}
    </li>
  );
}
