"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, formHelpers } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import DatePicker from "@/components/shared/date-picker";
import { useDialogOpen } from "@/components/shared/row-edit-context";
import { savePayPeriod } from "@/features/pay/actions";
import { formatRange } from "@/lib/dates";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/** Days as they are typed: "12/31, 1/1, 1/2". */
const typed = (dates = []) => dates.map((d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`).join(", ");

/**
 * Add a pay period to the schedule, or (in a row's menu) change one: its
 * first and last day, its pay date, and the days it is closed or optional,
 * each set with what it is. A new one starts from `next`: the day after the
 * last period, as long as two weeks, paid two days after it ends.
 */
export default function PayPeriodForm({ period, next }) {
  const isEdit = Boolean(period?.id);
  const [open, setOpen, inRowMenu, onCloseAutoFocus] = useDialogOpen();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(savePayPeriod, EMPTY);
  const record = period
    ? {
        starts_on: period.from, ends_on: period.to, pay_date: period.payDate ?? "",
        closed_dates: typed(period.closed), closed_label: period.closedLabel,
        optional_dates: typed(period.optional), optional_label: period.optionalLabel,
      }
    : { starts_on: next?.from ?? "", ends_on: next?.to ?? "", pay_date: next?.payDate ?? "" };
  const { fe, invalid, dv } = formHelpers(state, record);

  useEffect(() => {
    if (state?.ok) {
      toast.success(isEdit ? "Pay period updated" : "Pay period added");
      setOpen(false);
      router.refresh();
    } else if (state?.error && !state?.fieldErrors) {
      toast.error(state.error);
    }
  }, [state, isEdit, router, setOpen]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {inRowMenu ? null : (
        <DialogTrigger asChild>
          <Button size="sm" data-add-pay-period><Plus /> Add pay period</Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-xl" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Pay period ${formatRange(period.from, period.to)}` : "Add a pay period"}</DialogTitle>
          <DialogDescription>Managers see the schedule on Pay &amp; Hours. Work days count Monday to Friday, less the closed days.</DialogDescription>
        </DialogHeader>
        {/* Keyed by its first day: after one is added, the next starts where it ended. */}
        <form key={record.starts_on} action={formAction} noValidate className="flex flex-col gap-4" data-pay-period-form>
          {isEdit ? <input type="hidden" name="id" value={period.id} /> : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="First day" required error={fe("starts_on")}>
              <DatePicker name="starts_on" defaultValue={dv("starts_on")} invalid={invalid("starts_on")} aria-label="First day" />
            </Field>
            <Field label="Last day" required error={fe("ends_on")}>
              <DatePicker name="ends_on" defaultValue={dv("ends_on")} invalid={invalid("ends_on")} aria-label="Last day" />
            </Field>
            <Field label="Pay date" error={fe("pay_date")}>
              <DatePicker name="pay_date" defaultValue={dv("pay_date")} invalid={invalid("pay_date")} aria-label="Pay date" />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr]">
            <Field label="Closed days" error={fe("closed_dates")} hint="Not work days: 12/31, 1/1, 1/2">
              <Input name="closed_dates" maxLength={300} defaultValue={dv("closed_dates")} aria-invalid={invalid("closed_dates")} placeholder="12/31, 1/1, 1/2" />
            </Field>
            <Field label="Closed for" error={fe("closed_label")}>
              <Input name="closed_label" maxLength={80} defaultValue={dv("closed_label")} aria-invalid={invalid("closed_label")} placeholder="New Years" />
            </Field>
            <Field label="Optional days" error={fe("optional_dates")} hint="Still work days: 1/19">
              <Input name="optional_dates" maxLength={300} defaultValue={dv("optional_dates")} aria-invalid={invalid("optional_dates")} placeholder="1/19" />
            </Field>
            <Field label="Optional for" error={fe("optional_label")}>
              <Input name="optional_label" maxLength={80} defaultValue={dv("optional_label")} aria-invalid={invalid("optional_label")} placeholder="MLK Day" />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save changes" : "Add pay period"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
