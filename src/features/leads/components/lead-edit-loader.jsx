"use client";

import { useContext, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RowEditContext } from "@/components/shared/row-edit-context";
import LeadForm from "@/features/leads/components/lead-form";
import { loadLeadForEdit } from "@/features/leads/actions";

/**
 * A row's Edit, on a list of leads: the list carries only what it shows, so the
 * whole record is read when Edit is chosen (a moment, under "Opening…"), fresh
 * each time, then the form opens with it. Inside a row's action menu only.
 */
export default function LeadEditLoader({ id, name, options }) {
  const row = useContext(RowEditContext);
  const open = Boolean(row?.open);
  const [lead, setLead] = useState(null);

  useEffect(() => {
    if (!open) {
      // Closed: forget it, so the next Edit reads what was saved since.
      setLead(null);
      return;
    }
    let gone = false;
    const f = new FormData();
    f.set("id", String(id));
    loadLeadForEdit(f).then(
      (result) => {
        if (gone) return;
        if (result?.ok) setLead(result.data);
        else {
          toast.error(result?.error ?? "That lead could not be opened. Try again.");
          row?.setOpen(false);
        }
      },
      () => {
        if (gone) return;
        toast.error("That lead could not be opened. Try again.");
        row?.setOpen(false);
      }
    );
    return () => {
      gone = true;
    };
  }, [open, id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (lead) return <LeadForm lead={lead} options={options} />;
  return (
    <Dialog open={open} onOpenChange={(o) => row?.setOpen(o)}>
      <DialogContent className="max-w-sm" onCloseAutoFocus={row?.returnFocus} data-lead-edit-loading>
        <DialogHeader>
          <DialogTitle>Edit {name}</DialogTitle>
          <DialogDescription>Opening the lead…</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center py-4 text-primary">
          <Loader2 className="size-6 animate-spin" aria-hidden />
        </div>
      </DialogContent>
    </Dialog>
  );
}
