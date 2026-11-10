"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Mail, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reach } from "@/lib/reach";
import { sendPaymentReminder, setPaymentPaid } from "@/features/funding/actions";
import { formatIso } from "@/lib/dates";

/**
 * A payment's buttons (client, Nov 2026): Mark paid (or Undo, once paid), and Remind client
 * for one unpaid when the client takes payment reminders. For the administrators and the
 * client's Sales Rep, on the project's page and Payments Due.
 */
export default function PaymentActions({ payment, reminders }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn, done) => start(async () => {
    const r = await reach(fn);
    if (r.ok) {
      toast.success(done(r.data));
      router.refresh();
    } else toast.error(r.error);
  });
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
    </span>
  );
}
