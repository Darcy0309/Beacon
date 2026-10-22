"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Select, formHelpers } from "@/components/ui/field";
import { MONTH_NAMES } from "@/lib/team";
import { updateMyProfile } from "@/features/auth/actions";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/**
 * Your own contact details, on My Security: name, phone, mobile. The sign-in
 * email is shown but stays an administrator's to change.
 */
export default function ProfileForm({ me, staff = false }) {
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
      {staff ? (
        // The day the team wishes them happy birthday on Meet the Team (no year asked).
        <div className="grid grid-cols-2 gap-3 sm:max-w-sm" data-birthday>
          <Field label="Birthday" error={fe("birthday_month")} hint="Optional: the team sees it on your birthday">
            <Select name="birthday_month" defaultValue={me.birthday ? String(Number(me.birthday.slice(5, 7))) : ""} aria-label="Birthday month">
              <option value="">Month</option>
              {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Day" error={fe("birthday_day")}>
            <Select name="birthday_day" defaultValue={me.birthday ? String(Number(me.birthday.slice(8, 10))) : ""} aria-label="Birthday day" aria-invalid={invalid("birthday_day")}>
              <option value="">Day</option>
              {Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
            </Select>
          </Field>
        </div>
      ) : null}
      {staff ? (
        <Field label="About me" error={fe("bio")} hint="A line or two clients read on Meet the Team, e.g. what you work on and how long you've been here.">
          <Textarea name="bio" rows={2} maxLength={280} defaultValue={dv("bio")} aria-invalid={invalid("bio")} data-bio />
        </Field>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">You sign in as {me.email}. An administrator can change that.</span>
        <Button type="submit" size="sm" disabled={pending}><Save /> {pending ? "Saving…" : "Save details"}</Button>
      </div>
    </form>
  );
}
