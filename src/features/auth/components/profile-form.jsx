"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, formHelpers } from "@/components/ui/field";
import { updateMyProfile } from "@/features/auth/actions";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/**
 * Your own contact details, on My Security: name, phone, mobile. The sign-in
 * email is shown but stays an administrator's to change.
 */
export default function ProfileForm({ me }) {
  const [state, action, pending] = useActionState(updateMyProfile, EMPTY);
  const router = useRouter();
  const { fe, invalid, dv } = formHelpers(state, me);

  useEffect(() => {
    if (state?.ok) {
      toast.success("Your details are saved");
      router.refresh();
    } else if (state?.error && !state?.fieldErrors) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form action={action} noValidate className="space-y-4 p-5" data-profile-form>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="First name" required error={fe("first_name")}>
          <Input name="first_name" maxLength={40} defaultValue={dv("first_name")} aria-invalid={invalid("first_name")} autoComplete="given-name" />
        </Field>
        <Field label="Last name" error={fe("last_name")}>
          <Input name="last_name" maxLength={40} defaultValue={dv("last_name")} aria-invalid={invalid("last_name")} autoComplete="family-name" />
        </Field>
        <Field label="Phone" error={fe("phone")}>
          <Input name="phone" type="tel" defaultValue={dv("phone")} aria-invalid={invalid("phone")} autoComplete="tel" placeholder="(602) 555-0100" />
        </Field>
        <Field label="Mobile" error={fe("mobile")}>
          <Input name="mobile" type="tel" defaultValue={dv("mobile")} aria-invalid={invalid("mobile")} autoComplete="tel" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">You sign in as {me.email}. An administrator can change that.</span>
        <Button type="submit" size="sm" disabled={pending}><Save /> {pending ? "Saving…" : "Save details"}</Button>
      </div>
    </form>
  );
}
