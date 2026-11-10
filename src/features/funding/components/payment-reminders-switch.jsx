"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { reach } from "@/lib/reach";
import { setClientPaymentReminders } from "@/features/funding/actions";
import { cn } from "@/lib/utils";

/**
 * A client's payment reminders, on or off (client, Nov 2026: per client, for all its projects).
 * On, its Sales Rep can email it a reminder of a payment due; nothing goes to it on its own.
 */
export default function PaymentRemindersSwitch({ companyId, on: start }) {
  const [on, setOn] = useState(Boolean(start));
  const [pending, begin] = useTransition();
  const flip = () => {
    const next = !on;
    setOn(next);
    begin(async () => {
      const r = await reach(() => setClientPaymentReminders(companyId, next));
      if (r.ok) toast.success(next ? "Payment reminders on: the Sales Rep can email this client" : "Payment reminders off");
      else {
        setOn(!next);
        toast.error(r.error);
      }
    });
  };
  return (
    <button type="button" role="switch" aria-checked={on} onClick={flip} disabled={pending} data-payment-reminders-switch={on ? "on" : "off"}
      className="group inline-flex items-center gap-2 text-sm">
      <span className={cn("relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-muted-foreground/30")}>
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform", on ? "translate-x-4" : "translate-x-0.5")} />
      </span>
      {on ? "On" : "Off"}
    </button>
  );
}
