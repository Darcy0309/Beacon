"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Mail, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/shared/confirm-dialog";
import { reach } from "@/lib/reach";
import { sendPaymentReminder, setPaymentPaid, setPaymentRemoved } from "@/features/funding/actions";
import { formatIso } from "@/lib/dates";
import { usd } from "@/lib/funding";

/**
 * A payment's buttons (client, Nov 2026): Mark paid (or Undo, once paid), and Remind client
 * for one unpaid when the client takes payment reminders, and Remove for one not owed after
 * all (the client stopped their program; Put back undoes it). For the administrators and the
 * client's Sales Rep, on the project's page and Payments Due.
 */
export default function PaymentActions({ payment, reminders }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const run = (fn, done) => start(async () => {
    const r = await reach(fn);
    setAsking(false);
    if (r.ok) {
      toast.success(done(r.data));
      router.refresh();
    } else toast.error(r.error);
  });
  if (payment.removedAt) {
    return (
      <span className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground" data-removed>Removed {formatIso(payment.removedAt.slice(0, 10), "medium")}</span>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setPaymentRemoved(payment.id, false), () => "Put back: owed again")}
          data-payment-restore={payment.id} aria-label={`Put ${payment.label} back`}>
          <Undo2 /> Put back
        </Button>
      </span>
    );
  }
  if (payment.paidAt) {
    return (
      <span className="flex items-center justify-end gap-2">
        <span className="text-xs text-emerald-600 dark:text-emerald-400" data-paid>Paid {formatIso(payment.paidAt.slice(0, 10), "medium")}</span>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setPaymentPaid(payment.id, false), () => "Marked unpaid")}
          data-payment-unpaid={payment.id} aria-label={`Mark ${payment.label} unpaid`}>
          <Undo2 /> Undo
        </Button>
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      {reminders ? (
        <Button type="button" size="sm" variant="outline" disabled={pending} data-payment-remind={payment.id}
          title={payment.clientRemindedAt ? `Reminded ${formatIso(payment.clientRemindedAt.slice(0, 10), "medium")}` : "Email the client a reminder"}
          onClick={() => run(() => sendPaymentReminder(payment.id), (d) => `Reminder sent to ${d.to.join(", ")}`)}>
          <Mail /> {payment.clientRemindedAt ? "Remind again" : "Remind client"}
        </Button>
      ) : null}
      <Button type="button" size="sm" disabled={pending} onClick={() => run(() => setPaymentPaid(payment.id, true), () => "Marked paid")}
        data-payment-paid={payment.id} aria-label={`Mark ${payment.label} paid`}>
        <Check /> Mark paid
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setAsking(true)} className="text-muted-foreground hover:text-destructive"
        data-payment-remove={payment.id} aria-label={`Remove ${payment.label}`} title="Not owed after all (the client stopped their program)">
        <X /> Remove
      </Button>
      <ConfirmDialog open={asking} onOpenChange={setAsking} pending={pending} confirm="Remove it" icon={<X />}
        title={`Remove ${payment.label}?`}
        description={`${usd(payment.amount)}${payment.due ? `, due ${formatIso(payment.due, "medium")}` : ""}, won't be owed: it comes off what's still owed and the reminders, and stays on the project struck through. Put back undoes it.`}
        onConfirm={() => run(() => setPaymentRemoved(payment.id, true), () => "Payment removed")} />
    </span>
  );
}
