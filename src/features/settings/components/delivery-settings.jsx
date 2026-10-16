"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { saveDeliverySettings } from "@/features/delivery/hold-actions";
import { CLEARING_CHOICES, DELIVERY_MODES, ZONES, deliverySettings, hourLabel } from "@/lib/delivery-schedule";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };
const HOURS = Array.from({ length: 24 }, (_, h) => h);

/**
 * How leads and appointments go to clients (Sean, Oct 2026): each kind
 * emailed as soon as a call makes it, or held in QA (Quality QA › Waiting to
 * Send) until an administrator sends it or the schedule clears what is held:
 * every few hours between two hours of the day, every day. `value`: the
 * delivery setting.
 */
export default function DeliverySettings({ value }) {
  const st = deliverySettings(value);
  const [state, action, pending] = useActionState(saveDeliverySettings, EMPTY);
  useEffect(() => {
    if (state.ok) toast.success("Delivery saved");
    else if (state.error) toast.error(state.error);
  }, [state]);
  return (
    <Card id="delivery" data-delivery-settings>
      <SectionHeader label="Delivery to Clients" icon={Send} />
      <form action={action} className="space-y-4 p-5">
        <p className="max-w-2xl text-sm text-muted-foreground">
          When a call makes a name a lead or an appointment, its sheet is emailed to the client: straight away, or held in Quality QA
          until an administrator sends it (one, some or all) or the schedule below clears what is held. One held back there stays
          unsent until its manager marks it fixed.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[["leads", "Leads"], ["appointments", "Appointments"]].map(([key, label]) => (
            <Field key={key} label={label}>
              <Select name={key} defaultValue={st[key]} data-delivery-mode={key}>
                {DELIVERY_MODES.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
              </Select>
            </Field>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Held ones go out" className="col-span-2 sm:col-span-1">
            <Select name="every" defaultValue={String(st.every)} data-delivery-every>
              {CLEARING_CHOICES.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
            </Select>
          </Field>
          <Field label="From">
            <Select name="from" defaultValue={String(st.from)}>{HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</Select>
          </Field>
          <Field label="Until">
            <Select name="to" defaultValue={String(st.to)}>{HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</Select>
          </Field>
          <Field label="Time zone">
            <Select name="zone" defaultValue={st.zone}>{ZONES.map(([z, name]) => <option key={z} value={z}>{name}</option>)}</Select>
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">Every day of the week, on the hour. Leads and appointments sent straight away are not affected.</p>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </Card>
  );
}
