"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select, formHelpers } from "@/components/ui/field";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { createAppointment, updateAppointment } from "@/lib/actions";
import { DURATIONS } from "@/lib/validate";
import { fullName } from "@/lib/display";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

const TIMES = [
  "8:00 AM","8:30 AM","9:00 AM","9:30 AM","10:00 AM","10:30 AM","11:00 AM","11:30 AM",
  "12:00 PM","12:30 PM","1:00 PM","1:30 PM","2:00 PM","2:30 PM","3:00 PM","3:30 PM",
  "4:00 PM","4:30 PM","5:00 PM","5:30 PM",
];

export default function AppointmentForm({ appointment, options, leads = [], defaultLeadId, trigger }) {
  const isEdit = Boolean(appointment?.id);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(isEdit ? updateAppointment : createAppointment, EMPTY);

  useEffect(() => {
    if (state?.ok) {
      toast.success(isEdit ? "Appointment updated" : "Appointment scheduled");
      setOpen(false);
      router.refresh();
    } else if (state?.error && !state?.fieldErrors) {
      toast.error(state.error);
    }
  }, [state, isEdit, router]);

  const { apptStatuses = [], managers = [] } = options ?? {};
  const record = appointment
    ? { ...appointment, status_id: appointment.status?.id ?? "", user_id: appointment.user?.id ?? "" }
    : { appt_date: new Date().toISOString().slice(0, 10), appt_time: "9:00 AM", duration_min: "30", lead_id: defaultLeadId ?? "" };
  const { fe, invalid, dv } = formHelpers(state, record);

  const lockedLead = defaultLeadId ? leads.find((l) => String(l.id) === String(defaultLeadId)) : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">{isEdit ? <Pencil /> : <CalendarPlus />} {isEdit ? "Edit" : "New appointment"}</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit appointment" : "Schedule appointment"}</DialogTitle>
        </DialogHeader>

        <form action={formAction} noValidate className="flex flex-col gap-4">
          {isEdit && <input type="hidden" name="id" value={appointment.id} />}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {!isEdit && (
              <Field label="Lead" required error={fe("lead_id")} className="sm:col-span-2">
                {lockedLead ? (
                  <>
                    <input type="hidden" name="lead_id" value={lockedLead.id} />
                    <Input disabled value={lockedLead.company_name ?? lockedLead.co ?? ""} />
                  </>
                ) : (
                  <Select name="lead_id" required defaultValue={dv("lead_id")} aria-invalid={invalid("lead_id")}>
                    <option value="" disabled>Select a lead…</option>
                    {leads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.company_name ?? l.co}{(l.city) ? ` — ${l.city}` : ""}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}

            <Field label="Date" required error={fe("appt_date")}>
              <Input name="appt_date" type="date" required defaultValue={dv("appt_date")} aria-invalid={invalid("appt_date")} />
            </Field>
            <Field label="Time" required error={fe("appt_time")}>
              <Select name="appt_time" required defaultValue={dv("appt_time")} aria-invalid={invalid("appt_time")}>
                {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>

            <Field label="Duration" error={fe("duration_min")}>
              <Select name="duration_min" defaultValue={String(dv("duration_min", "30"))} aria-invalid={invalid("duration_min")}>
                {DURATIONS.map((d) => <option key={d} value={d}>{d} minutes</option>)}
              </Select>
            </Field>
            <Field label="Status" error={fe("status_id")}>
              <Select name="status_id" defaultValue={dv("status_id")} aria-invalid={invalid("status_id")}>
                <option value="">—</option>
                {apptStatuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>

            <Field label="Rep" error={fe("user_id")} className="sm:col-span-2">
              <Select name="user_id" defaultValue={dv("user_id")} aria-invalid={invalid("user_id")}>
                <option value="">—</option>
                {managers.map((m) => <option key={m.id} value={m.id}>{fullName(m)}</option>)}
              </Select>
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save changes" : "Schedule"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
