"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select, formHelpers } from "@/components/ui/field";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { saveUser } from "@/features/users/actions";
import { ROLES } from "@/lib/nav";
import { PAY_MODELS, usd } from "@/lib/pay";
import { useDialogOpen } from "@/components/shared/row-edit-context";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/** `pay`: how they are paid ({ model, rate }); `hourly`: the hourly range from Settings. */
export default function UserForm({ user, options, pay, hourly, trigger }) {
  const isEdit = Boolean(user?.id);
  // Inside a row's action menu the menu owns the open state and there is no trigger.
  const [open, setOpen, inRowMenu, onCloseAutoFocus] = useDialogOpen();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveUser, EMPTY);

  // Track role locally so the company field can be marked required for clients,
  // and pay shows only for the people who are paid (account managers and agents).
  const [role, setRole] = useState(user?.role ?? "agent");
  const [payModel, setPayModel] = useState(pay?.model ?? "commission");

  useEffect(() => {
    if (state?.ok) {
      toast.success(isEdit ? "User updated" : `Invitation sent to ${state.data?.email ?? "them"}`);
      setOpen(false);
      router.refresh();
    } else if (state?.error && !state?.fieldErrors) {
      toast.error(state.error);
    }
  }, [state, isEdit, router, setOpen]);

  // After a save, React resets the form to what the action sent back (or to
  // the saved record); the parts shown for a role or for hybrid pay follow
  // the fields, so the form never shows hybrid fields under "Commission only".
  useEffect(() => {
    if (state === EMPTY) return;
    setRole(state?.values?.role || user?.role || "agent");
    setPayModel(state?.values?.pay_model || pay?.model || "commission");
  }, [state, user?.role, pay?.model]);

  const { companies = [] } = options ?? {};
  const record = {
    ...(user ? { ...user, company_id: user.company?.id ?? "" } : { role: "agent", status: "invited" }),
    pay_model: pay?.model ?? "commission",
    hourly_rate: pay?.rate == null ? "" : Number(pay.rate).toFixed(2),
  };
  const paid = role === "manager" || role === "agent";
  const { fe, invalid, dv } = formHelpers(state, record);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {inRowMenu ? null : (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button size="sm">{isEdit ? <Pencil /> : <UserPlus />} {isEdit ? "Edit" : "Invite user"}</Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit user" : "Invite user"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Changing the role or client account takes effect on their next request. Disabled accounts cannot sign in or read anything."
              : "They receive an email with a link to set their password. The account is active once they have."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} noValidate className="flex flex-col gap-4">
          {isEdit && <input type="hidden" name="id" value={user.id} />}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="First name" error={fe("first_name")}>
              <Input name="first_name" defaultValue={dv("first_name")} maxLength={40} aria-invalid={invalid("first_name")} autoFocus />
            </Field>
            <Field label="Last name" error={fe("last_name")}>
              <Input name="last_name" defaultValue={dv("last_name")} maxLength={40} aria-invalid={invalid("last_name")} />
            </Field>

            <Field label="Email" required error={fe("email")} className="sm:col-span-2">
              <Input name="email" type="email" inputMode="email" required defaultValue={dv("email")} maxLength={120} aria-invalid={invalid("email")} />
            </Field>

            <Field label="Role" required error={fe("role")}>
              <Select name="role" defaultValue={dv("role", "agent")} onChange={(e) => setRole(e.target.value)} aria-invalid={invalid("role")}>
                {Object.entries(ROLES).map(([key, r]) => <option key={key} value={key}>{r.label}</option>)}
              </Select>
            </Field>
            <Field label="Status" error={fe("status")} hint={isEdit ? "Disabled: signed out and locked out until re-enabled." : "New accounts start as Invited."}>
              {isEdit ? (
                <Select name="status" defaultValue={dv("status", "invited")} aria-invalid={invalid("status")}>
                  <option value="active">Active</option>
                  {/* Invited is where an account starts, not somewhere it can be put back. */}
                  {user?.status === "invited" ? <option value="invited">Invited</option> : null}
                  <option value="disabled">Disabled</option>
                </Select>
              ) : (
                <>
                  <input type="hidden" name="status" value="invited" />
                  <Input value="Invited — until they set a password" disabled />
                </>
              )}
            </Field>

            <Field label="Username" error={fe("username")} hint="3–25 letters, numbers, . _ -">
              <Input name="username" defaultValue={dv("username")} maxLength={25} autoCapitalize="off" aria-invalid={invalid("username")} />
            </Field>
            <Field label="Phone" error={fe("phone")}>
              <Input name="phone" type="tel" inputMode="tel" placeholder="(602) 555-0100" defaultValue={dv("phone")} aria-invalid={invalid("phone")} />
            </Field>

            <Field
              label="Client account"
              required={role === "client"}
              error={fe("company_id")}
              className="sm:col-span-2"
              hint={role === "client" ? "Client users only see this account's projects." : "Leave blank for internal staff."}
            >
              <Select name="company_id" defaultValue={dv("company_id")} aria-invalid={invalid("company_id")}>
                <option value="">Internal staff — no client</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>

            {paid ? (
              <>
                <Field label="Pay" error={fe("pay_model")} className="sm:col-span-2"
                  hint={payModel === "hybrid" ? "Each pay period: their hours at this rate, or their commission, whichever is higher." : "Lead, appointment and special pay at each project's rates."}>
                  <Select name="pay_model" defaultValue={dv("pay_model")} onChange={(e) => setPayModel(e.target.value)} aria-invalid={invalid("pay_model")}>
                    {PAY_MODELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                </Field>
                {payModel === "hybrid" ? (
                  <Field label="Hourly rate ($)" required error={fe("hourly_rate")}
                    hint={hourly ? `Between ${usd(hourly.min)} and ${usd(hourly.max)} (Settings › Pay & time).` : undefined}>
                    <Input name="hourly_rate" type="number" inputMode="decimal" step="0.01" min={hourly?.min} max={hourly?.max}
                      defaultValue={dv("hourly_rate")} aria-invalid={invalid("hourly_rate")} />
                  </Field>
                ) : null}
              </>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? (isEdit ? "Saving…" : "Sending…") : isEdit ? "Save changes" : "Send invitation"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
