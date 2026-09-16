"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select, formHelpers } from "@/components/ui/field";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { saveUser } from "@/lib/actions";
import { ROLES } from "@/lib/nav";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

export default function UserForm({ user, options, trigger }) {
  const isEdit = Boolean(user?.id);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveUser, EMPTY);

  // Track role locally so the company field can be marked required for clients.
  const [role, setRole] = useState(user?.role ?? "agent");

  useEffect(() => {
    if (state?.ok) {
      toast.success(isEdit ? "User updated" : "User invited");
      setOpen(false);
      router.refresh();
    } else if (state?.error && !state?.fieldErrors) {
      toast.error(state.error);
    }
  }, [state, isEdit, router]);

  const { companies = [] } = options ?? {};
  const record = user
    ? { ...user, company_id: user.company?.id ?? "" }
    : { role: "agent", status: "invited" };
  const { fe, invalid, dv } = formHelpers(state, record);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">{isEdit ? <Pencil /> : <UserPlus />} {isEdit ? "Edit" : "Invite user"}</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit user" : "Invite user"}</DialogTitle>
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
            <Field label="Status" error={fe("status")}>
              <Select name="status" defaultValue={dv("status", "invited")} aria-invalid={invalid("status")}>
                <option value="active">Active</option>
                <option value="invited">Invited</option>
                <option value="disabled">Disabled</option>
              </Select>
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
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save changes" : "Invite"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
