"use client";

import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/**
 * "Are you sure?" before something is deleted, taken off or ended: what is
 * about to happen, a way back, and the button that does it. Nothing of the
 * kind in Lighthouse runs on one click.
 *
 *   open, onOpenChange   the dialog's state (it stays open while `pending`)
 *   title, description   what is asked, and what will happen
 *   confirm              the button's words ("Delete")
 *   icon                 its icon, an element (<Trash2 /> by default)
 *   destructive          red, for deleting; false for ending or leaving
 *   onConfirm            runs it; the caller closes the dialog when it is done
 *   children             in place of the button, when confirming submits a form
 */
export default function ConfirmDialog({
  open, onOpenChange, title, description, confirm = "Delete", icon = <Trash2 />, destructive = true, pending = false, onConfirm, children,
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => (o || !pending) && onOpenChange(o)}>
      <DialogContent className="max-w-md" data-confirm-dialog>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending} data-confirm-cancel>Cancel</Button>
          {children ?? (
            <Button type="button" variant={destructive ? "destructive" : "default"} disabled={pending} onClick={onConfirm} data-confirm>
              {pending ? <Loader2 className="animate-spin" /> : icon}
              {pending ? "Working…" : confirm}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
