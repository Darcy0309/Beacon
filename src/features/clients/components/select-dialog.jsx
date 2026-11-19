"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { useNavigationRouter } from "@/components/layout/navigation-progress";
import { Button } from "@/components/ui/button";
import { formHelpers } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { saveSelectTerm } from "@/features/clients/actions";
import SelectFields from "@/features/clients/components/select-fields";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/**
 * A client's Signature Select on its own (Sean, Nov 2026), for its Sales Rep on Payments Due: its terms, the
 * one on now to change (an end put in stops it, and their access after that day), or a new one.
 */
export default function SelectDialog({ client, terms = [], today }) {
  const router = useNavigationRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(saveSelectTerm, EMPTY);
  const { fe, invalid } = formHelpers(state, {});
  const problem = state?.error && !state?.fieldErrors ? state.error : null;
  useEffect(() => {
    if (!state?.ok) return;
    toast.success("Signature Select saved");
    setOpen(false);
    router.refresh();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" data-select-edit={client.id}><Pencil /> {terms.length ? "Edit" : "Add"}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Signature Select · {client.name}</DialogTitle>
          <DialogDescription>Put in the last day when they stop paying: their access to Lighthouse ends after it.</DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="flex flex-col gap-4" data-select-dialog>
          <input type="hidden" name="company_id" value={client.id} />
          <SelectFields terms={terms} today={today} open={open} fe={fe} invalid={invalid} />
          {problem ? <p className="text-sm text-destructive" role="alert">{problem}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
