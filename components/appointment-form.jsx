"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/ui/field";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { createAppointment, updateAppointment } from "@/lib/actions";
import { fullName } from "@/lib/display";

const EMPTY = { ok: false, data: null, error: null };

const TIMES = [
  "8:00 AM","8:30 AM","9:00 AM","9:30 AM","10:00 AM","10:30 AM","11:00 AM","11:30 AM",
  "12:00 PM","12:30 PM","1:00 PM","1:30 PM","2:00 PM","2:30 PM","3:00 PM","3:30 PM",
  "4:00 PM","4:30 PM","5:00 PM","5:30 PM",
];

export default function AppointmentForm({ appointment, options, leads = [], defaultLeadId, trigger }) {
  const isEdit = Boolean(appointment?.id);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    isEdit ? updateAppointment : createAppointment,
    EMPTY
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success(isEdit ? "Appointment updated" : "Appointment scheduled");
      setOpen(false);
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, isEdit, router]);

  const { apptStatuses = [], managers = [] } = options ?? {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            {isEdit ? <Pencil /> : <CalendarPlus />} {isEdit ? "Edit" : "New appointment"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit appointment" : "Schedule appointment"}</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          {isEdit && <input type="hidden" name="id" value={appointment.id} />}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {!isEdit && (
              <Field label="Lead" className="sm:col-span-2">
                {defaultLeadId ? (
                  <input type="hidden" name="lead_id" value={defaultLeadId} />
                ) : null}
                {defaultLeadId ? (
                  <Input
                    disabled
                    value={leads.find((l) => String(l.id) === String(defaultLeadId))?.company_name ?? ""}
                  />
                ) : (
                  <Select name="lead_id" required defaultValue="">
                    <option value="" disabled>Select a lead…</option>
                    {leads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.company_name}
                        {l.city ? ` — ${l.city}` : ""}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}

            <Field label="Date">
              <Input
                name="appt_date"
                type="date"
                required
                defaultValue={appointment?.appt_date ?? new Date().toISOString().slice(0, 10)}
              />
            </Field>
            <Field label="Time">
              <Select name="appt_time" defaultValue={appointment?.appt_time ?? "9:00 AM"}>
                {TIMES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </Field>

            <Field label="Duration">
              <Select name="duration_min" defaultValue={appointment?.duration_min ?? 30}>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
              </Select>
            </Field>
            <Field label="Status">
              <Select name="status_id" defaultValue={appointment?.status?.id ?? ""}>
                <option value="">—</option>
                {apptStatuses.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>

            <Field label="Rep" className="sm:col-span-2">
              <Select name="user_id" defaultValue={appointment?.user?.id ?? ""}>
                <option value="">—</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>{fullName(m)}</option>
                ))}
              </Select>
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
