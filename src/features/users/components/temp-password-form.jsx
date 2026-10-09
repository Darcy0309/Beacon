"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, KeyRound, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, formHelpers } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDialogOpen } from "@/components/shared/row-edit-context";
import { setTemporaryPassword } from "@/features/users/actions";
import { generateTempPassword } from "@/lib/temp-password";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/**
 * "Set temporary password" from a user's row menu: a new password to give
 * them by phone or text, which they replace with their own at their next
 * sign-in. Passwords are never stored readable, so this, not looking one
 * up, is how someone who is stuck gets back in.
 */
export default function TempPasswordForm({ user }) {
  const [open, setOpen, , onCloseAutoFocus] = useDialogOpen();
  const [state, action, pending] = useActionState(setTemporaryPassword, EMPTY);
  const [temp, setTemp] = useState("");
  const router = useRouter();
  const { fe, invalid } = formHelpers(state, null);

  // A fresh one each time it opens.
  useEffect(() => {
    if (open) setTemp(generateTempPassword());
  }, [open]);

  useEffect(() => {
    if (state?.ok) {
      toast.success(`Temporary password set for ${state.data?.email}. Give it to them; they choose their own when they sign in.`,
        state.data?.emailed ? { description: state.data.emailed } : undefined);
      setOpen(false);
      router.refresh();
    } else if (state?.error && !state?.fieldErrors) {
      toast.error(state.error);
    }
  }, [state, router, setOpen]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Set a temporary password for {user.name}</DialogTitle>
          <DialogDescription>
            Passwords are never stored where anyone can read them, so none can be looked up. This replaces theirs:
            give it to them by phone or text, and they choose their own at their next sign-in.
          </DialogDescription>
        </DialogHeader>
        <form action={action} noValidate className="flex flex-col gap-4" data-temp-password-form>
          <input type="hidden" name="id" value={user.id} />
          <Field label="Temporary password" required error={fe("temp_password")}>
            <div className="flex gap-2">
              <Input name="temp_password" value={temp} onChange={(e) => setTemp(e.target.value)} maxLength={72} autoComplete="off"
                spellCheck={false} className="font-mono" aria-invalid={invalid("temp_password")} />
              <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setTemp(generateTempPassword())} aria-label="Generate a password"><Wand2 /></Button>
              <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" aria-label="Copy the password"
                onClick={() => navigator.clipboard?.writeText(temp).then(() => toast.success("Copied"), () => {})}><Copy /></Button>
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="send_link" className="size-4 accent-[var(--primary)]" />
            Also email them a sign-in link (without the password)
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}><KeyRound /> {pending ? "Setting…" : "Set password"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
