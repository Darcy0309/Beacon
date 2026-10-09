"use client";

import { useRef, useState, useTransition } from "react";
import Link from "@/components/shared/intent-link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Eye, Pencil, Trash2, KeyRound, Loader2, MailPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { RowEditContext } from "@/components/shared/row-edit-context";

const DEFAULT_WARNING = "This cannot be undone. Records that referred to it will be left without it.";

/**
 * The ⋯ menu on a table row. Every item does what it says or is not shown:
 *   href              — "Open" links to the record's page
 *   edit              — a record form element (e.g. <UserForm user={…} />);
 *                       "Edit" opens it through RowEditContext
 *   onDelete          — a server action taking FormData with `id`; "Delete"
 *                       asks first, then runs it
 *   warning           — what the delete confirmation says will happen
 *   onResetTwoFactor  — a server action taking FormData with `id`
 *   onResendInvite    — a server action taking FormData with `id`
 *   forms             — more dialogs, each opened by its own item, as `edit`
 *                       is: [{ key, label, icon, element }], `icon` an element
 *                       (<KeyRound />): a server page cannot pass a component
 */
export default function RowActions({
  name = "record", href, id, edit, onDelete, warning = DEFAULT_WARNING, onResetTwoFactor, onResendInvite, forms = [],
}) {
  const router = useRouter();
  const triggerRef = useRef(null);
  const [editOpen, setEditOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(null); // the key of the open extra form
  const [confirm, setConfirm] = useState(null); // 'delete' | 'reset' | null
  const [pending, startTransition] = useTransition();

  // Dialogs opened from a menu item have no trigger of their own, so on
  // close Radix would drop focus on <body>. Send it back to the ⋯ button,
  // where keyboard and screen-reader users left off.
  const returnFocus = (event) => {
    event.preventDefault();
    triggerRef.current?.focus();
  };

  const run = (action, done) =>
    startTransition(async () => {
      const f = new FormData();
      f.set("id", String(id));
      const result = await action(f);
      if (result?.ok) {
        toast.success(done);
        setConfirm(null);
        router.refresh();
      } else {
        toast.error(result?.error ?? "That didn't work. Try again.");
      }
    });

  const hasMenu = href || edit || onDelete || onResetTwoFactor || onResendInvite || forms.length;
  if (!hasMenu) return null;

  return (
    <>
      {/* Non-modal: a modal menu closing while its item opens a dialog can
          leave the page's pointer lock behind, and nothing is clickable. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button ref={triggerRef} variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel className="max-w-48 truncate">{name}</DropdownMenuLabel>
          {href ? (
            <DropdownMenuItem asChild>
              <Link href={href}><Eye /> Open</Link>
            </DropdownMenuItem>
          ) : null}
          {edit ? (
            <DropdownMenuItem onSelect={() => setEditOpen(true)}><Pencil /> Edit</DropdownMenuItem>
          ) : null}
          {onResendInvite ? (
            <DropdownMenuItem
              disabled={pending}
              onSelect={() => run(onResendInvite, `Invitation sent again to ${name}`)}
            >
              <MailPlus /> Resend invitation
            </DropdownMenuItem>
          ) : null}
          {forms.map((f) => (
            <DropdownMenuItem key={f.key} onSelect={() => setFormOpen(f.key)}>{f.icon ?? null} {f.label}</DropdownMenuItem>
          ))}
          {onResetTwoFactor ? (
            <DropdownMenuItem onSelect={() => setConfirm("reset")}><KeyRound /> Reset two-factor</DropdownMenuItem>
          ) : null}
          {onDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}><Trash2 /> Delete</DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {edit ? (
        <RowEditContext.Provider value={{ open: editOpen, setOpen: setEditOpen, returnFocus }}>
          {edit}
        </RowEditContext.Provider>
      ) : null}
      {forms.map((f) => (
        <RowEditContext.Provider key={f.key} value={{ open: formOpen === f.key, setOpen: (o) => setFormOpen(o ? f.key : null), returnFocus }}>
          {f.element}
        </RowEditContext.Provider>
      ))}

      <Dialog open={confirm !== null} onOpenChange={(o) => !o && !pending && setConfirm(null)}>
        <DialogContent className="max-w-md" onCloseAutoFocus={returnFocus}>
          <DialogHeader>
            <DialogTitle>{confirm === "reset" ? `Reset two-factor for ${name}?` : `Delete ${name}?`}</DialogTitle>
            <DialogDescription>
              {confirm === "reset"
                ? "Their authenticator will be removed. They can sign in with their password alone and set up a new one under My Security."
                : warning}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirm(null)} disabled={pending}>Cancel</Button>
            <Button
              type="button"
              variant={confirm === "reset" ? "default" : "destructive"}
              disabled={pending}
              onClick={() =>
                confirm === "reset"
                  ? run(onResetTwoFactor, `Two-factor reset for ${name}`)
                  : run(onDelete, `Deleted ${name}`)
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : confirm === "reset" ? <KeyRound /> : <Trash2 />}
              {pending ? "Working…" : confirm === "reset" ? "Reset" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
