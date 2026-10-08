"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, formHelpers } from "@/components/ui/field";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useDialogOpen } from "@/components/shared/row-edit-context";
import { saveCarrier } from "@/features/insurance/actions";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/**
 * Add a carrier, or (in a row's menu) change one: its name, the lines of
 * business it writes and the states it is active in. `carrier` omitted:
 * a new one.
 */
export default function CarrierForm({ carrier }) {
  const isEdit = Boolean(carrier?.id);
  const [open, setOpen, inRowMenu, onCloseAutoFocus] = useDialogOpen();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveCarrier, EMPTY);
  const { fe, invalid, dv } = formHelpers(state, carrier ? { name: carrier.name, association: carrier.association, territory: carrier.territory } : null);

  useEffect(() => {
    if (state?.ok) {
      toast.success(isEdit ? "Carrier updated" : "Carrier added");
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
          <Button size="sm" data-add-carrier><Plus /> Add carrier</Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${carrier.name}` : "Add a carrier"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} noValidate className="flex flex-col gap-4">
          {isEdit ? <input type="hidden" name="id" value={carrier.id} /> : null}
          <Field label="Name" required error={fe("name")}>
            <Input name="name" maxLength={120} defaultValue={dv("name")} aria-invalid={invalid("name")} autoFocus />
          </Field>
          <Field label="Lines of business" error={fe("association")} hint="e.g. P&C, Workers comp, Life, Health">
            <Input name="association" maxLength={120} defaultValue={dv("association")} aria-invalid={invalid("association")} />
          </Field>
          <Field label="States" error={fe("territory")} hint="Where it writes business, separated by commas: AZ, CA, NM">
            <Input name="territory" maxLength={300} defaultValue={dv("territory")} aria-invalid={invalid("territory")} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save changes" : "Add carrier"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
