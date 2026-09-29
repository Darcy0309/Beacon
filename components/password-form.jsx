"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, formHelpers } from "@/components/ui/field";
import { changePassword } from "@/lib/actions";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/**
 * Set or change your own password. A newly invited person lands here from
 * their email link (`welcome`), and setting the password turns the account on.
 */
export default function PasswordForm({ welcome = false, isClient = false }) {
  const [state, formAction, pending] = useActionState(changePassword, EMPTY);
  const formRef = useRef(null);
  const router = useRouter();
  const { fe, invalid } = formHelpers(state, null);

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.data?.activated ? "Password set — your account is active" : "Password changed");
      formRef.current?.reset();
      router.replace("/security");
      router.refresh();
    } else if (state?.error && !state?.fieldErrors) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={formAction} noValidate className="space-y-4 p-5">
      {welcome ? (
        <p className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
          Welcome to Lighthouse. Choose a password to finish setting up your account.
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={welcome ? "Password" : "New password"} required error={fe("password")} hint="At least 10 characters.">
          <Input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={72} required aria-invalid={invalid("password")} autoFocus={welcome} />
        </Field>
        <Field label="Confirm" required error={fe("confirm")}>
          <Input name="confirm" type="password" autoComplete="new-password" minLength={10} maxLength={72} required aria-invalid={invalid("confirm")} />
        </Field>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {isClient ? "Administrators are told when a client account's password changes." : "You stay signed in on this device."}
        </span>
        <Button type="submit" size="sm" disabled={pending}>
          <KeyRound /> {pending ? "Saving…" : welcome ? "Set password" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
